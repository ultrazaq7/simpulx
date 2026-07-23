package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
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
	// ONE message per listing: the link rides in the caption rather than a second
	// bubble. The split used to keep the image bubble hugging the photo (a long URL
	// widens it), but it doubled the messages every listing costs — noisier for the
	// customer and twice the send volume against WhatsApp's rate limits.
	base := strings.TrimRight(config.Get("APP_BASE_URL", "http://localhost:3000"), "/")
	lines = append(lines, "", fmt.Sprintf("%s/listing/%s/%s", base, c.OrgSlug, c.Slug))
	out := events.MessageOutbound{
		ConversationID: convID, SenderType: "bot", Type: "text",
		Body: strings.Join(lines, "\n"),
	}
	if cover != "" {
		out.Type, out.MediaURL = "image", cover
	}
	_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, out)
}

// Price/spec card for one campaign_catalog variant, sent when a customer taps it
// in the AI's "pilih varian" list. Deterministic and credit-free, mirroring the
// property card -- but the catalog has no photos, so this is a text card carrying
// the variant name, OTR, location, and whatever segment-specific spec keys sit in
// the attributes jsonb (dp, tenor, cicilan, transmisi, ...).
// fmtAttrValue renders a catalog attribute value for the card. Numbers come out of
// jsonb as float64, which "%v" prints in scientific notation for large values; this
// formats money as "Rp 57.547.844", tenor as "12 bulan", and leaves text as-is.
func fmtAttrValue(key string, v any, money bool) string {
	var n float64
	isNum := false
	switch t := v.(type) {
	case float64:
		n, isNum = t, true
	case json.Number:
		if f, err := t.Float64(); err == nil {
			n, isNum = f, true
		}
	case string:
		s := strings.TrimSpace(t)
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			n, isNum = f, true
		} else {
			return s // already a formatted string ("CVT", "Putih")
		}
	}
	if !isNum {
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
	if key == "tenor" {
		return fmt.Sprintf("%d bulan", int64(n))
	}
	if money {
		return "Rp " + groupThousands(int64(n))
	}
	return strconv.FormatInt(int64(n), 10)
}

// groupThousands formats an integer with dot separators, Indonesian style.
func groupThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	neg := ""
	if strings.HasPrefix(s, "-") {
		neg, s = "-", s[1:]
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	return neg + string(out)
}

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

	// item_name often already contains the variant ("NEW XPANDER CROSS 4X2 MT"),
	// so blindly appending variant_name produced "... Cross 4X2 MT" duplication.
	// Only add the variant when the item doesn't already include it.
	title := strings.TrimSpace(item)
	if v := strings.TrimSpace(variant); v != "" && !strings.Contains(strings.ToLower(title), strings.ToLower(v)) {
		title = strings.TrimSpace(title + " " + v)
	}
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
	// Surface a few common spec keys if present, in a stable order. Money fields are
	// formatted as Rupiah and tenor as months -- catalog stores them as raw numbers,
	// so %v rendered them in scientific notation ("Tdp: 5.75e+07"), which is the bug.
	var bag map[string]any
	_ = json.Unmarshal(attrs, &bag)
	labels := map[string]string{"dp": "DP", "tdp": "TDP", "tenor": "Tenor", "cicilan": "Cicilan",
		"angsuran": "Angsuran", "transmisi": "Transmisi", "warna": "Warna"}
	money := map[string]bool{"dp": true, "tdp": true, "cicilan": true, "angsuran": true, "otr": true}
	for _, k := range []string{"dp", "tdp", "tenor", "cicilan", "angsuran", "transmisi", "warna"} {
		v, ok := bag[k]
		if !ok || v == nil {
			continue
		}
		s := fmtAttrValue(k, v, money[k])
		if s != "" {
			lines = append(lines, labels[k]+": "+s)
		}
	}
	lines = append(lines, "", "Mau saya bantu simulasi cicilan atau jadwalkan test drive?")

	_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
		ConversationID: convID, SenderType: "bot", Type: "text", Body: strings.Join(lines, "\n"),
	})
}
