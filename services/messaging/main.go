// messaging: jantung channel I/O. Mengonsumsi message.received (normalisasi +
// persist pesan masuk) dan message.outbound (kirim ke WhatsApp + persist).
// Setiap pesan yang tersimpan menghasilkan message.persisted untuk ai-agent &
// realtime.
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/simpulx/v2/libs/go/broker"
	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/db"
	"github.com/simpulx/v2/libs/go/events"
	logx "github.com/simpulx/v2/libs/go/log"
)

type app struct {
	st   *store
	bus  *broker.Broker
	snd  *sender
	vsnd *viberSender
	log  interface {
		Info(string, ...any)
		Error(string, ...any)
		Warn(string, ...any)
	}
	// outboxKick wakes the outbox relay immediately after a message is
	// persisted, so realtime delivery doesn't wait for the next poll tick.
	outboxKick chan struct{}
}

// kickOutbox requests an immediate outbox drain (non-blocking; a pending kick
// already covers this one).
func (a *app) kickOutbox() {
	select {
	case a.outboxKick <- struct{}{}:
	default:
	}
}

func main() {
	log := logx.New("messaging")
	ctx := context.Background()

	pool, err := db.Connect(ctx, config.Get("DATABASE_URL", ""))
	if err != nil {
		log.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	bus, err := broker.Connect(config.Get("NATS_URL", "nats://nats:4222"))
	if err != nil {
		log.Error("nats connect failed", "err", err)
		os.Exit(1)
	}
	defer bus.Close()

	a := &app{
		st:   &store{pool: pool, bus: bus},
		bus:  bus,
		snd:  newSender(config.GetBool("WA_MOCK", true), config.Get("WA_GRAPH_BASE", "https://graph.facebook.com/v21.0")),
		vsnd: newViberSender(config.GetBool("WA_MOCK", true)),
		log:  log,

		outboxKick: make(chan struct{}, 1),
	}

	if err := bus.Subscribe(events.SubjectMessageReceived, "messaging-inbound", a.onReceived); err != nil {
		log.Error("subscribe received failed", "err", err)
		os.Exit(1)
	}
	if err := bus.Subscribe(events.SubjectMediaResolved, "messaging-media", a.onMediaResolved); err != nil {
		log.Error("subscribe media resolved failed", "err", err)
		os.Exit(1)
	}
	if err := bus.Subscribe(events.SubjectMessageOutbound, "messaging-outbound", a.onOutbound); err != nil {
		log.Error("subscribe outbound failed", "err", err)
		os.Exit(1)
	}
	if err := bus.Subscribe(events.SubjectMessageStatusUpdated, "messaging-status", a.onStatusUpdated); err != nil {
		log.Error("subscribe status updated failed", "err", err)
		os.Exit(1)
	}
	log.Info("messaging consuming events")

	// health endpoint sederhana
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200); _, _ = w.Write([]byte("ok")) })
		_ = http.ListenAndServe(":8081", mux)
	}()

	go a.runOutboxRelay(ctx)
	go a.runFollowUpCron(ctx)
	// Agent-facing follow-up reminders (score-based) live in the conversation
	// service's sweep, which routes through the real notification pipeline.

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Info("messaging stopped")
}

// onReceived: normalisasi pesan masuk WA -> persist -> publish message.persisted.
func (a *app) onReceived(env events.Envelope) error {
	var e events.MessageReceived
	if err := json.Unmarshal(env.Data, &e); err != nil {
		a.log.Warn("decode received", "err", err)
		return nil // payload rusak, jangan redeliver
	}
	ctx := context.Background()

	ch, err := a.st.resolveChannel(ctx, e.PhoneNumberID)
	if err != nil {
		a.log.Warn("resolve channel", "ref", e.PhoneNumberID, "err", err)
		return nil
	}
	// WhatsApp keys contacts by phone; Meta (Messenger/Instagram) by PSID.
	var contactID string
	if e.Channel == "whatsapp" {
		contactID, err = a.st.upsertContact(ctx, env.OrgID, e.From, e.ContactName, e.Channel)
	} else {
		contactID, err = a.st.upsertContactExternal(ctx, env.OrgID, e.From, e.ContactName, e.Channel)
	}
	if err != nil {
		a.log.Error("upsertContact failed", "org", env.OrgID, "err", err)
		return err // transient, redeliver
	}
	body := e.Message.Text

	// Multi-thread routing. A contact can hold parallel "lead instances" (one
	// conversation per campaign). Resolve THIS message's campaign first:
	//   1. CTWA ad referral (source_id ∈ campaign.ad_source_ids), else
	//   2. keyword in the body (∈ campaign.keywords).
	// If matched -> open/continue that campaign's lead instance (isolated per
	// campaign). If NOT matched -> attach to the contact's latest active lead
	// instance (decision #1); a brand-new no-signal contact gets a fresh
	// unassigned conversation that waits quietly in the manager/admin queue for a
	// human to pick up (decision #2 - no auto bot prompt).
	var conv convInfo
	// Branch's ad source is more specific than a campaign's -> check it first.
	campaignID, branchID := "", ""
	matched := false
	if dID, cID, ok := a.st.resolveBranchByReferral(ctx, env.OrgID, e.Referral); ok {
		branchID, campaignID, matched = dID, cID, true
	} else if cID, ok := a.st.resolveCampaignByReferral(ctx, env.OrgID, e.Referral); ok {
		campaignID, matched = cID, true
	} else if e.Referral != "" {
		// The click came from an ad but its id isn't registered on any campaign or
		// branch, so the lead lands unassigned. Say WHICH id arrived: without this
		// the source_id is discarded silently and there is no way to tell a missing
		// referral apart from one that simply doesn't match.
		a.log.Warn("CTWA referral did not match any campaign - lead will be unassigned",
			"org", env.OrgID, "ad_source_id", e.Referral, "ctwa_clid", e.ReferralCtwaClid)
	}
	// Property e-catalog: a lead arriving from the public microsite carries that
	// unit's own link in the prefilled message. Resolving it is more precise than a
	// keyword (it identifies the exact unit, not just a campaign), so it is checked
	// first; the unit is remembered on the conversation below so the agent opens the
	// chat already knowing which property the buyer was looking at.
	listingID, listingTitle := "", ""
	if !matched {
		if lID, cID, title, ok := a.st.resolveListingByURL(ctx, env.OrgID, body); ok {
			listingID, listingTitle = lID, title
			if cID != "" {
				campaignID, matched = cID, true
			}
		}
	}
	// Tracked because a keyword-routed body is an ad/link template pre-fill ("pajero1"),
	// not something the lead typed -> it must not count as genuine below.
	keywordRouted := false
	if !matched {
		if cID, ok := a.st.resolveCampaignByKeyword(ctx, env.OrgID, body); ok {
			campaignID, matched, keywordRouted = cID, true, true
		}
	}
	if matched {
		conv, err = a.st.getOrCreateThread(ctx, env.OrgID, contactID, e.Channel, ch.ID, campaignID, branchID)
	} else {
		conv, _, err = a.st.getOrCreateConversation(ctx, env.OrgID, contactID, e.Channel, ch.ID)
	}
	if err != nil {
		a.log.Error("getOrCreateConversation failed", "org", env.OrgID, "contact", contactID, "err", err)
		return err
	}
	// Remember the exact unit the buyer arrived from, so the agent opens the chat
	// already knowing which property is in play and the AI can ground on it.
	if listingID != "" {
		a.st.attachListing(ctx, conv.ID, listingID, listingTitle)
	}

	// A revived (previously-closed) thread: broadcast the status flip so clients
	// still showing it as closed correct it live - the inbound message.persisted
	// alone doesn't carry a status change.
	if conv.Reopened {
		_ = a.bus.Publish(events.SubjectConversationUpdated, env.OrgID, events.ConversationUpdated{
			ConversationID: conv.ID, Status: "open",
		})
	}

	// 3.1 Multi-Touch Attribution Schema: Selalu simpan jejak klik iklan!
	if e.Referral != "" {
		cr := adCreative{ImageURL: e.ReferralImageURL, Headline: e.ReferralHeadline, Body: e.ReferralBody, MediaType: e.ReferralMediaType}
		if err := a.st.recordAttribution(ctx, env.OrgID, conv.ID, campaignID, e.Referral, e.ReferralURL, e.ReferralCtwaClid, cr); err != nil {
			a.log.Warn("recordAttribution failed", "conv", conv.ID, "err", err)
		}
	}
	// If the thread is routed (has a campaign/branch) but still unassigned (e.g. no
	// agent was eligible at first touch), pick it up now on this fresh message.
	a.st.ensureAssigned(ctx, conv.ID)
	// CTWA ad opener (referral) is template pre-fill, not genuinely typed -> not
	// genuine, so the lead classifier ignores it (avoids biasing every ad lead).
	// A keyword-routed body is the same thing arriving without a referral: a wa.me
	// link pre-filled by the ad ("pajero1"). It used to count as genuine, so the AI
	// read the ad's tracking param as the customer's own words -- and answered it.
	// "unsupported" juga bukan konten asli (Meta tak mengirim isinya) -> not genuine.
	genuine := e.Referral == "" && !keywordRouted && e.Message.Type != "unsupported"
	// Simpan payload webhook mentah untuk pesan "unsupported" agar bisa diinspeksi
	// dari DB (messages.metadata.raw_webhook) -- konten asli tak pernah hilang lagi.
	meta := buildMessageMeta(e)
	msgID, err := a.st.insertInbound(ctx, env.OrgID, conv.ID, e.Message.Type, body, e.Message.MediaURL, e.Message.ExternalID, genuine, mediaPreview(e.Message.Type, body), meta)
	if err == nil {
		a.kickOutbox() // deliver realtime immediately, don't wait for the poll tick
	}
	if err != nil {
		if err.Error() == "duplicate message" {
			a.log.Info("duplicate message dropped", "ext", e.Message.ExternalID)
			return nil // ACK NATS
		}
		a.log.Error("insertInbound failed", "conv", conv.ID, "err", err)
		return err
	}

	a.log.Info("inbound persisted (outbox created)", "conv", conv.ID, "msg", msgID)

	// Broadcast CTA click: a tapped template button carries a "bc_<recipient_id>"
	// payload -> mark that broadcast recipient as clicked (report conversions).
	if e.Message.ButtonPayload != "" {
		a.trackBroadcastClick(ctx, e.Message.ButtonPayload)
		// A tapped unit from the AI's listing list ("unit:<slug>"). Answered right
		// here rather than through the AI: the customer asked for one specific,
		// already-known unit, so a deterministic card is instant, always correct,
		// and costs the tenant no AI credit.
		if slug, ok := strings.CutPrefix(e.Message.ButtonPayload, "unit:"); ok {
			if slug = strings.TrimSpace(slug); slug != "" {
				a.sendListingCard(ctx, env.OrgID, conv.ID, slug)
			}
		}
		// A tapped catalog variant from the automotive/segment "pilih varian" list.
		// Same deterministic, credit-free answer as the property card, but from
		// campaign_catalog (a price/spec text card -- the catalog has no photos).
		if id, ok := strings.CutPrefix(e.Message.ButtonPayload, "cat:"); ok {
			if id = strings.TrimSpace(id); id != "" {
				a.sendCatalogCard(ctx, env.OrgID, conv.ID, id)
			}
		}
	}

	// Run user-configured automations (keyword reply, auto-tag, auto-assign,
	// button_click, ...). Deterministic rules, not the AI assistant. Best-effort,
	// never blocks ingest.
	a.runAutomations(ctx, env.OrgID, conv.ID, contactID, ch.ID, body, e.Message.ButtonPayload, e.Message.Type, e.Message.MediaURL)

	// Decision #2: a brand-new contact whose first message carried no campaign
	// signal (no CTWA referral, no keyword) is left UNASSIGNED in the manager/admin
	// queue for a human to pick up. We deliberately do NOT auto-reply with a bot
	// prompt - new leads land quietly (no AI auto-chat).
	return nil
}

// onOutbound: kirim ke WA (mock di dev) -> persist -> publish message.persisted.
func (a *app) onOutbound(env events.Envelope) error {
	var e events.MessageOutbound
	if err := json.Unmarshal(env.Data, &e); err != nil {
		a.log.Warn("decode outbound", "err", err)
		return nil
	}
	ctx := context.Background()

	// Resolusi percakapan: langsung (agen/bot) atau via kontak (broadcast).
	convID := e.ConversationID
	if convID == "" && e.ContactID != "" {
		conv, _, err := a.st.getOrCreateConversation(ctx, env.OrgID, e.ContactID, "whatsapp", e.ChannelID)
		if err != nil {
			return err
		}
		convID = conv.ID
	}
	if convID == "" {
		a.log.Warn("outbound tanpa conversation/contact, diabaikan")
		return nil
	}

	target, err := a.st.sendTarget(ctx, convID)
	if err != nil {
		return err
	}
	var externalID string
	switch {
	case e.Template != nil:
		// Real HSM template send (initiate chat / outside 24h window).
		externalID, err = a.snd.sendTemplateParams(ctx, target, e.Template)
	case target.ChannelType == "viber":
		externalID, err = a.vsnd.send(ctx, target, e.Type, e.Body, e.MediaURL)
	case e.Interactive != nil:
		externalID, err = a.snd.sendInteractive(ctx, target, e.Interactive)
	case e.MediaURL != "" && (e.Type == "image" || e.Type == "audio" || e.Type == "video" || e.Type == "document"):
		externalID, err = a.snd.sendMedia(ctx, target, e.Type, e.MediaURL, e.Body)
	case e.Type == "location":
		externalID, err = a.snd.sendLocation(ctx, target, e.Latitude, e.Longitude, e.LocationName, e.LocationAddress)
	default:
		externalID, err = a.snd.sendText(ctx, target, e.Body)
	}
	// A shared location is stored in the message metadata so the inbox renders the
	// same map card it shows for an inbound pin (see buildMessageMeta / _LocationCard).
	var metaJSON string
	if e.Type == "location" {
		if b, mErr := json.Marshal(map[string]any{
			"location": map[string]any{
				"latitude":  e.Latitude,
				"longitude": e.Longitude,
				"name":      e.LocationName,
				"address":   e.LocationAddress,
			},
		}); mErr == nil {
			metaJSON = string(b)
		}
	}
	status := "sent"
	if err != nil {
		a.log.Error("outbound send failed", "channel", target.ChannelType, "err", err)
		status = "failed"
	}
	msgID, err2 := a.st.insertOutbound(ctx, env.OrgID, convID, e.SenderType, e.SenderID, e.Type, e.Body, e.MediaURL, externalID, status, mediaPreview(e.Type, e.Body), metaJSON)
	if err2 != nil {
		if err2.Error() == "duplicate message" {
			a.log.Info("duplicate outbound message dropped", "ext", externalID)
			return nil
		}
		// NEVER redeliver once the message has already left for the channel. The
		// send happens BEFORE this insert, so returning an error here makes NATS
		// redeliver the event and send the SAME message to the customer again —
		// which is exactly how a failing insert turned into a WhatsApp flood
		// (same text dozens of times, until Meta rate-limited the number).
		// Losing the local row is bad; spamming a real customer is far worse, so
		// ack and shout instead.
		a.log.Error("outbound persisted FAILED after send - acking to avoid resend",
			"conv", convID, "ext", externalID, "status", status, "err", err2)
		return nil
	}
	a.kickOutbox() // deliver realtime immediately, don't wait for the poll tick

	// Broadcast: tautkan message ini ke baris broadcast_recipients agar laporan
	// bisa membaca status delivered/read langsung (bukan tebakan time-window).
	if e.BroadcastRecipientID != "" {
		if err := a.st.linkBroadcastRecipient(ctx, e.BroadcastRecipientID, msgID); err != nil {
			a.log.Warn("link broadcast recipient failed", "recip", e.BroadcastRecipientID, "err", err)
		}
	}

	a.log.Info("outbound persisted (outbox created)", "conv", convID, "msg", msgID, "status", status)
	return nil
}

// onStatusUpdated: handle Meta delivery/read receipts
func (a *app) onStatusUpdated(env events.Envelope) error {
	var e events.MessageStatusUpdated
	if err := json.Unmarshal(env.Data, &e); err != nil {
		a.log.Warn("decode status updated", "err", err)
		return nil
	}
	// Our own client-facing re-broadcast (below) carries a resolved message id and
	// is relayed straight to WS; ignore it here so we don't reprocess in a loop.
	if e.MessageID != "" {
		return nil
	}
	ctx := context.Background()

	msgID, convID, err := a.st.updateMessageStatus(ctx, e.ExternalID, e.Status)
	if err != nil {
		a.log.Warn("updateMessageStatus failed or not found", "ext_id", e.ExternalID, "err", err)
		return nil
	}

	a.log.Info("message status updated", "conv", convID, "ext_id", e.ExternalID, "status", e.Status)
	// Re-broadcast the status carrying the resolved conversation + message id so
	// clients patch the exact bubble's tick (sent→delivered→read) and the inbox
	// row's last-outbound status live - WhatsApp-style receipts, no refetch.
	return a.bus.Publish(events.SubjectMessageStatusUpdated, env.OrgID, events.MessageStatusUpdated{
		ExternalID:     e.ExternalID,
		Status:         e.Status,
		Timestamp:      e.Timestamp,
		ConversationID: convID,
		MessageID:      msgID,
	})
}

func preview(s string) string {
	r := []rune(s)
	if len(r) > 120 {
		return string(r[:120])
	}
	return s
}

// onMediaResolved patches the message row once the async media download is
// done, then re-broadcasts message.persisted with MediaUpdated so the open
// chat swaps its placeholder for the real image/sticker/file in place.
func (a *app) onMediaResolved(env events.Envelope) error {
	var e events.MediaResolved
	if err := json.Unmarshal(env.Data, &e); err != nil {
		return err
	}
	if e.ExternalID == "" || e.MediaURL == "" {
		return nil
	}
	ctx := context.Background()
	var msgID, convID, direction, senderType, msgType, body string
	var err error
	// Tiny retry: the resolver can (rarely) beat the insert transaction.
	for attempt := 0; attempt < 5; attempt++ {
		err = a.st.pool.QueryRow(ctx,
			`UPDATE messages SET media_url = $1
			  WHERE organization_id = $2 AND external_id = $3
			 RETURNING id::text, conversation_id::text, direction, sender_type, type, COALESCE(body,'')`,
			e.MediaURL, env.OrgID, e.ExternalID,
		).Scan(&msgID, &convID, &direction, &senderType, &msgType, &body)
		if err == nil {
			break
		}
		time.Sleep(300 * time.Millisecond)
	}
	if err != nil {
		a.log.Warn("media resolved: message row not found", "ext", e.ExternalID, "err", err)
		return nil // don't redeliver forever; the media is stored, row just missing
	}
	if perr := a.bus.Publish(events.SubjectMessagePersisted, env.OrgID, events.MessagePersisted{
		ConversationID: convID, MessageID: msgID, Direction: direction,
		SenderType: senderType, Type: msgType, Body: body,
		MediaURL: e.MediaURL, Preview: mediaPreview(msgType, body),
		MediaUpdated: true,
	}); perr != nil {
		a.log.Error("publish media update failed", "err", perr)
	}
	return nil
}

// buildMessageMeta assembles the per-message metadata JSON stored on the row so
// the inbox can render rich content WhatsApp-style: the CTWA ad creative, shared
// contact cards, a pinned location, and the raw webhook for unsupported types.
func buildMessageMeta(e events.MessageReceived) string {
	m := map[string]any{}
	// Keep the referral whenever an ad id arrived, not only when Meta also sent
	// creative fields: a text-only ad used to leave no trace at all, so an
	// unmatched click looked identical to an organic message.
	if e.Referral != "" || e.ReferralImageURL != "" || e.ReferralHeadline != "" || e.ReferralBody != "" || e.ReferralURL != "" {
		m["referral"] = map[string]any{
			"image_url":  e.ReferralImageURL,
			"headline":   e.ReferralHeadline,
			"body":       e.ReferralBody,
			"source_url": e.ReferralURL,
			"media_type": e.ReferralMediaType,
			// Disimpan supaya pembaca bisa join ke ad_creatives per-ad; URL gambar
			// referral sendiri expired cepat (fbcdn bertanda tangan).
			"source_id": e.Referral,
		}
	}
	if len(e.Message.Contacts) > 0 {
		m["contacts"] = e.Message.Contacts
	}
	if e.Message.Location != nil {
		m["location"] = e.Message.Location
	}
	if e.Message.Type == "unsupported" && len(e.Raw) > 0 {
		m["raw_webhook"] = json.RawMessage(e.Raw)
	}
	if len(m) == 0 {
		return ""
	}
	b, err := json.Marshal(m)
	if err != nil {
		return ""
	}
	return string(b)
}

// mediaPreview falls back to a type placeholder when a media message has no caption.
func mediaPreview(msgType, body string) string {
	if body != "" {
		return preview(body)
	}
	switch msgType {
	case "image":
		return "📷 Photo"
	case "audio":
		return "🎤 Audio"
	case "video":
		return "🎥 Video"
	case "document":
		return "📄 Document"
	case "sticker":
		// Bracket marker, not a picture-frame emoji: 🖼️ read as an image
		// everywhere it wasn't turned into an icon. Every client detects
		// "[sticker]" and renders a proper sticker glyph (web: lucide Sticker;
		// mobile: the exported PNG); notifications normalize it to "Sticker".
		return "[sticker]"
	case "interactive", "button":
		return "🔘 Button message"
	case "template", "hsm":
		return "📝 Template message"
	case "location":
		return "📍 Location"
	case "contacts":
		return "👤 Contact"
	case "reaction":
		return "❤️ Reaction"
	case "order":
		return "🛒 Order"
	case "system":
		return "⚙️ System message"
	case "poll_creation", "poll_update":
		return "📊 Poll"
	case "call", "voice_call", "video_call":
		return "📞 Call"
	case "ephemeral":
		return "⏳ Disappearing message"
	case "unsupported", "unknown":
		return "⚠️ Unsupported message"
	default:
		if msgType != "" && msgType != "text" {
			return "📎 " + msgType
		}
		return ""
	}
}

// ── Outbox Relay Worker ──

func (a *app) runOutboxRelay(ctx context.Context) {
	// The ticker is only a safety net (crash recovery / missed kicks); the
	// normal path is the immediate kick fired right after a message commits,
	// so realtime delivery is near-instant instead of waiting up to 500ms.
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-a.outboxKick:
			a.processOutbox(ctx)
		case <-ticker.C:
			a.processOutbox(ctx)
		}
	}
}

func (a *app) processOutbox(ctx context.Context) {
	rows, err := a.st.pool.Query(ctx,
		`SELECT id, organization_id, topic, payload FROM outbox_events WHERE status = 'pending' ORDER BY created_at LIMIT 100`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var orgID string
		var topic string
		var payload []byte
		if err := rows.Scan(&id, &orgID, &topic, &payload); err != nil {
			continue
		}

		var p events.MessagePersisted
		if err := json.Unmarshal(payload, &p); err == nil {
			if err := a.bus.Publish(topic, orgID, p); err == nil {
				_, _ = a.st.pool.Exec(ctx, `UPDATE outbox_events SET status = 'published', published_at = now() WHERE id = $1`, id)
			} else {
				a.log.Error("outbox publish failed", "topic", topic, "err", err)
			}
		} else {
			a.log.Error("outbox unmarshal failed", "topic", topic, "err", err)
		}
	}
}

// ── Background Cron Workers ──

func (a *app) runFollowUpCron(ctx context.Context) {
	// 5 minutes (was 15) so the early ~10-minute nudge lands at 10-15 minutes of
	// silence instead of drifting to 25; the long-cadence thresholds are hours to
	// days, so the tighter tick costs nothing there.
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.triggerFollowUps(ctx)
		}
	}
}

func (a *app) triggerFollowUps(ctx context.Context) {
	// Multi-touch cadence (WS-E), anchored to the customer's last message so a
	// silent lead is nudged on a widening schedule; a genuine reply resets
	// followup_count + last_contact_message_at, restarting the cadence.
	//   touch 1 @ 12h, touch 2 @ 20h  -> inside WhatsApp's 24h window: free-form
	//                                     LLM nudges (no template needed).
	//   touch 3 @ 1d, touch 4 @ 3d, touch 5 @ 7d -> outside the 24h window: these
	//     need an approved WhatsApp template (configured per campaign). Until one
	//     exists the ai-agent skips the send, but the count still advances so the
	//     lead is closed out on schedule (see autoMarkNoResponseLost).
	// The cadence above is the 'normal' baseline; each campaign scales it via
	// campaigns.followup_frequency (off = never, low = ~1.8x slower, high = ~0.5x
	// faster). f.factor multiplies every interval threshold.
	rows, err := a.st.pool.Query(ctx, `
		SELECT cv.id::text, cv.organization_id::text
		FROM conversations cv
		LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
		CROSS JOIN LATERAL (SELECT CASE COALESCE(cmp.followup_frequency, 'normal')
		                             WHEN 'high' THEN 0.5 WHEN 'low' THEN 1.8 ELSE 1.0 END AS factor) f
		WHERE cv.is_bot_active = true
		  AND cv.status = 'open'
		  AND NOT cv.classification_locked
		  AND cv.last_contact_message_at IS NOT NULL
		  AND cv.followup_count < 5
		  AND COALESCE(cmp.followup_frequency, 'normal') <> 'off'
		  -- Best follow-up TIME: only fire during local daytime (WIB 08:00-20:59).
		  -- The interval thresholds decide when a nudge becomes DUE; this holds a
		  -- due nudge until a good hour so it never lands at 3am (kills reply rate
		  -- and reads as spam). A nudge due at night simply goes out next morning;
		  -- the count still advances then, so the 7-day close-out is unaffected.
		  AND EXTRACT(hour FROM NOW() AT TIME ZONE 'Asia/Jakarta') BETWEEN 8 AND 20
		  AND (
		    (cv.followup_count = 0 AND cv.last_contact_message_at < NOW() - (INTERVAL '12 hours' * f.factor))
		    OR (cv.followup_count = 1 AND cv.last_contact_message_at < NOW() - (INTERVAL '20 hours' * f.factor))
		    OR (cv.followup_count = 2 AND cv.last_contact_message_at < NOW() - (INTERVAL '24 hours' * f.factor))
		    OR (cv.followup_count = 3 AND cv.last_contact_message_at < NOW() - (INTERVAL '3 days' * f.factor))
		    OR (cv.followup_count = 4 AND cv.last_contact_message_at < NOW() - (INTERVAL '7 days' * f.factor))
		  )
	`)
	if err != nil {
		a.log.Warn("failed to fetch followups", "err", err)
		return
	}
	defer rows.Close()

	var toTrigger []struct{ convID, orgID string }
	for rows.Next() {
		var c, o string
		if err := rows.Scan(&c, &o); err == nil {
			toTrigger = append(toTrigger, struct{ convID, orgID string }{c, o})
		}
	}
	rows.Close()

	for _, t := range toTrigger {
		_, err := a.st.pool.Exec(ctx, `UPDATE conversations SET followup_count = followup_count + 1 WHERE id = $1`, t.convID)
		if err != nil {
			continue
		}

		payload := events.CmdAIDraftFollowup{ConversationID: t.convID}
		if err := a.bus.Publish(events.SubjectCmdAIDraftFollowup, t.orgID, payload); err != nil {
			a.log.Warn("failed to trigger ai followup", "err", err, "conv", t.convID)
		}
	}

	a.triggerEarlyNudges(ctx)
	a.autoMarkNoResponseLost(ctx)
}

// triggerEarlyNudges sends ONE extra soft follow-up ~10 minutes after a lead
// goes quiet mid-chat, while they are still in-session (reviewed on a live
// property lead: bot asked a question at 13:12, lead stayed silent, and the
// first cadence touch would only fire 12 HOURS later). Rules that keep it from
// ever feeling spammy:
//   - only when the BOT spoke last (its question is what went unanswered);
//   - once per conversation (early_nudged), and only before the cadence starts
//     (followup_count = 0) so it never stacks on the 12h/20h/1d/3d/7d touches;
//   - only within a 10-60 minute window: any older and the lead has left the
//     session, so the normal cadence handles it instead;
//   - no daytime gate: the lead was active minutes ago, so they are awake.
//
// followup_count is NOT advanced: the long cadence still runs on schedule.
func (a *app) triggerEarlyNudges(ctx context.Context) {
	rows, err := a.st.pool.Query(ctx, `
		SELECT cv.id::text, cv.organization_id::text
		FROM conversations cv
		LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
		WHERE cv.is_bot_active = true
		  AND cv.status = 'open'
		  AND NOT cv.classification_locked
		  AND NOT cv.early_nudged
		  AND cv.followup_count = 0
		  AND COALESCE(cmp.followup_frequency, 'normal') <> 'off'
		  AND cv.last_contact_message_at < NOW() - INTERVAL '10 minutes'
		  AND cv.last_contact_message_at > NOW() - INTERVAL '60 minutes'
		  AND EXISTS (
		    SELECT 1 FROM messages m
		     WHERE m.conversation_id = cv.id
		       AND m.created_at > cv.last_contact_message_at
		       AND m.direction = 'outbound' AND m.sender_type = 'bot'
		  )
	`)
	if err != nil {
		a.log.Warn("failed to fetch early nudges", "err", err)
		return
	}
	defer rows.Close()

	var toNudge []struct{ convID, orgID string }
	for rows.Next() {
		var c, o string
		if err := rows.Scan(&c, &o); err == nil {
			toNudge = append(toNudge, struct{ convID, orgID string }{c, o})
		}
	}
	rows.Close()

	for _, t := range toNudge {
		if _, err := a.st.pool.Exec(ctx,
			`UPDATE conversations SET early_nudged = true WHERE id = $1`, t.convID); err != nil {
			continue
		}
		payload := events.CmdAIDraftFollowup{ConversationID: t.convID}
		if err := a.bus.Publish(events.SubjectCmdAIDraftFollowup, t.orgID, payload); err != nil {
			a.log.Warn("failed to trigger early nudge", "err", err, "conv", t.convID)
		}
	}
	if len(toNudge) > 0 {
		a.log.Info("early nudges sent", "count", len(toNudge))
	}
}

// autoMarkNoResponseLost closes out leads that ran the full follow-up cadence
// (all 5 touches, ~1 day past the final 7d nudge) without ever replying: it
// sets the Lost disposition (lost_reason 'ghosted' = no response), moves them to
// the Lost stage, and stands the bot down. Abusive/spam is handled separately and
// immediately (classification_locked), so this only touches genuine-but-silent
// leads. Reversible: a fresh customer reply resets followup_count and the D
// re-engagement path can revive the lead.
func (a *app) autoMarkNoResponseLost(ctx context.Context) {
	_, err := a.st.pool.Exec(ctx, `
		UPDATE conversations cv SET
		  disposition_id = COALESCE(cv.disposition_id,
		     (SELECT id FROM dispositions d
		        WHERE d.organization_id = cv.organization_id AND d.system_key = 'lost' LIMIT 1)),
		  lost_reason = COALESCE(cv.lost_reason, 'ghosted'),
		  stage_id = COALESCE(
		     (SELECT id FROM stages s
		        WHERE s.organization_id = cv.organization_id AND s.system_key = 'lost_not_purchase' LIMIT 1),
		     cv.stage_id),
		  ai_stage = 'lost_not_purchase',
		  interest_level = 'cold',
		  is_bot_active = false,
		  updated_at = now()
		WHERE cv.is_bot_active = true
		  AND cv.status = 'open'
		  AND NOT cv.classification_locked
		  AND cv.followup_count >= 5
		  AND cv.last_contact_message_at IS NOT NULL
		  AND cv.last_contact_message_at < NOW() - INTERVAL '8 days'
	`)
	if err != nil {
		a.log.Warn("auto-mark no-response lost failed", "err", err)
	}
}
