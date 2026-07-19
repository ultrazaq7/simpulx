package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/events"
)

// Photo card for one property unit, sent when a customer taps it in the AI's
// listing list. Deliberately built here rather than round-tripping through the
// AI: the customer picked a specific, already-known unit, so the answer is a
// lookup -- instant, always accurate, and it burns no AI credit.

type listingCard struct {
	Slug         string
	Title        string
	Price        *float64
	LocationArea *string
	City         *string
	Bedrooms     *int
	Bathrooms    *int
	LandArea     *float64
	BuildingArea *float64
	Certificate  *string
	Photos       []byte
	OrgSlug      string
}

// rupiahShort renders a price the way Indonesian listings speak it ("Rp 1,25 M",
// "Rp 850 juta"); full digits are unreadable at a glance in a chat bubble.
func rupiahShort(v *float64) string {
	if v == nil || *v <= 0 {
		return ""
	}
	n := *v
	if n >= 1e9 {
		s := strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", n/1e9), "0"), ".")
		return "Rp " + strings.Replace(s, ".", ",", 1) + " M"
	}
	return fmt.Sprintf("Rp %.0f juta", math.Round(n/1e6))
}

// waSafeImage mirrors the Python guard: WhatsApp renders only JPEG/PNG, so a
// content-negotiating CDN handing Meta a WebP silently fails the send.
func waSafeImage(u string) string {
	if u == "" {
		return ""
	}
	u = strings.ReplaceAll(u, "auto=format", "fm=jpg")
	base := strings.ToLower(u)
	if i := strings.Index(base, "?"); i >= 0 {
		base = base[:i]
	}
	for _, ext := range []string{".webp", ".gif", ".svg", ".avif", ".heic", ".heif"} {
		if strings.HasSuffix(base, ext) {
			return ""
		}
	}
	return u
}

func (a *app) sendListingCard(ctx context.Context, orgID, convID, slug string) {
	var c listingCard
	err := a.st.pool.QueryRow(ctx,
		`SELECT l.slug, l.title, l.price, l.location_area, l.city, l.bedrooms, l.bathrooms,
		        l.land_area, l.building_area, l.certificate, l.photos, o.slug
		   FROM listings l JOIN organizations o ON o.id = l.organization_id
		  WHERE l.organization_id = $1 AND l.slug = $2 AND l.status = 'published' LIMIT 1`,
		orgID, slug).Scan(&c.Slug, &c.Title, &c.Price, &c.LocationArea, &c.City,
		&c.Bedrooms, &c.Bathrooms, &c.LandArea, &c.BuildingArea, &c.Certificate,
		&c.Photos, &c.OrgSlug)
	if err != nil {
		a.log.Warn("listing card lookup failed", "slug", slug, "err", err)
		return
	}

	var photos []struct {
		URL string `json:"url"`
	}
	_ = json.Unmarshal(c.Photos, &photos)
	cover := ""
	if len(photos) > 0 {
		cover = waSafeImage(photos[0].URL)
	}

	lines := []string{c.Title}
	if p := rupiahShort(c.Price); p != "" {
		lines = append(lines, p)
	}
	if c.LocationArea != nil && *c.LocationArea != "" {
		lines = append(lines, *c.LocationArea)
	} else if c.City != nil {
		lines = append(lines, *c.City)
	}
	var spec []string
	if c.Bedrooms != nil && *c.Bedrooms > 0 {
		spec = append(spec, fmt.Sprintf("%d KT", *c.Bedrooms))
	}
	if c.Bathrooms != nil && *c.Bathrooms > 0 {
		spec = append(spec, fmt.Sprintf("%d KM", *c.Bathrooms))
	}
	if c.LandArea != nil && *c.LandArea > 0 {
		spec = append(spec, fmt.Sprintf("LT %.0fm2", *c.LandArea))
	}
	if c.BuildingArea != nil && *c.BuildingArea > 0 {
		spec = append(spec, fmt.Sprintf("LB %.0fm2", *c.BuildingArea))
	}
	if len(spec) > 0 {
		lines = append(lines, strings.Join(spec, ", "))
	}
	if c.Certificate != nil && *c.Certificate != "" {
		lines = append(lines, *c.Certificate)
	}
	out := events.MessageOutbound{
		ConversationID: convID, SenderType: "bot", Type: "text",
		Body: strings.Join(lines, "\n"),
	}
	if cover != "" {
		out.Type, out.MediaURL = "image", cover
	}
	_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, out)

	// Link goes in a SEPARATE text after the image (mirrors the Python card): a long
	// URL in the caption forces the bubble wider than the photo, leaving an empty
	// band beside it. On its own line the image bubble hugs the picture.
	base := strings.TrimRight(config.Get("APP_BASE_URL", "http://localhost:3000"), "/")
	_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
		ConversationID: convID, SenderType: "bot", Type: "text",
		Body: fmt.Sprintf("Foto & detail lengkap:\n%s/listing/%s/%s", base, c.OrgSlug, c.Slug),
	})
}

// Price/spec card for one campaign_catalog variant, sent when a customer taps it
// in the AI's "pilih varian" list. Deterministic and credit-free, mirroring the
// property card -- but the catalog has no photos, so this is a text card carrying
// the variant name, OTR, location, and whatever segment-specific spec keys sit in
// the attributes jsonb (dp, tenor, cicilan, transmisi, ...).
func (a *app) sendCatalogCard(ctx context.Context, orgID, convID, rowID string) {
	var (
		item, variant, location string
		price                   *float64
		attrs                   []byte
	)
	err := a.st.pool.QueryRow(ctx,
		`SELECT COALESCE(item_name,''), COALESCE(variant_name,''), COALESCE(location_name,''),
		        headline_price, COALESCE(attributes,'{}'::jsonb)
		   FROM campaign_catalog WHERE id = $1::uuid
		     AND campaign_id = (SELECT campaign_id FROM conversations WHERE id = $2) LIMIT 1`,
		rowID, convID).Scan(&item, &variant, &location, &price, &attrs)
	if err != nil {
		a.log.Warn("catalog card lookup failed", "row", rowID, "err", err)
		return
	}

	title := strings.TrimSpace(item + " " + variant)
	if title == "" {
		title = "Varian"
	}
	lines := []string{title}
	if p := rupiahShort(price); p != "" {
		lines = append(lines, "Harga: "+p)
	}
	if location != "" {
		lines = append(lines, location)
	}
	// Surface a few common spec keys if present, in a stable order, so the card is
	// useful without dumping the whole attribute bag.
	var bag map[string]any
	_ = json.Unmarshal(attrs, &bag)
	for _, k := range []string{"dp", "tdp", "tenor", "cicilan", "angsuran", "transmisi", "warna"} {
		if v, ok := bag[k]; ok && v != nil && fmt.Sprintf("%v", v) != "" {
			lines = append(lines, strings.Title(k)+": "+fmt.Sprintf("%v", v))
		}
	}
	lines = append(lines, "", "Mau saya bantu simulasi cicilan atau jadwalkan test drive?")

	_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
		ConversationID: convID, SenderType: "bot", Type: "text", Body: strings.Join(lines, "\n"),
	})
}
