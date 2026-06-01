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
	"syscall"

	"github.com/simpulx/v2/libs/go/broker"
	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/db"
	"github.com/simpulx/v2/libs/go/events"
	logx "github.com/simpulx/v2/libs/go/log"
)

type app struct {
	st  *store
	bus *broker.Broker
	snd *sender
	log interface {
		Info(string, ...any)
		Error(string, ...any)
		Warn(string, ...any)
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
		st:  &store{pool: pool},
		bus: bus,
		snd: newSender(config.GetBool("WA_MOCK", true), config.Get("WA_GRAPH_BASE", "https://graph.facebook.com/v21.0")),
		log: log,
	}

	if err := bus.Subscribe(events.SubjectMessageReceived, "messaging-inbound", a.onReceived); err != nil {
		log.Error("subscribe received failed", "err", err)
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
	// unassigned conversation and we prompt them to pick a campaign (decision #2).
	var conv convInfo
	var createdNoSignal bool
	campaignID, matched := a.st.resolveCampaignByReferral(ctx, env.OrgID, e.Referral)
	if !matched {
		campaignID, matched = a.st.resolveCampaignByKeyword(ctx, env.OrgID, body)
	}
	if matched {
		conv, err = a.st.getOrCreateThread(ctx, env.OrgID, contactID, e.Channel, ch.ID, campaignID)
	} else {
		conv, createdNoSignal, err = a.st.getOrCreateConversation(ctx, env.OrgID, contactID, e.Channel, ch.ID)
	}
	if err != nil {
		a.log.Error("getOrCreateConversation failed", "org", env.OrgID, "contact", contactID, "err", err)
		return err
	}
	// CTWA ad opener (referral) is template pre-fill, not genuinely typed -> not
	// genuine, so the lead classifier ignores it (avoids biasing every ad lead).
	genuine := e.Referral == ""
	msgID, err := a.st.insertInbound(ctx, env.OrgID, conv.ID, e.Message.Type, body, e.Message.MediaURL, e.Message.ExternalID, genuine, mediaPreview(e.Message.Type, body))
	if err != nil {
		a.log.Error("insertInbound failed", "conv", conv.ID, "err", err)
		return err
	}

	// Enroll the conversation into matching drip/follow-up sequences (idempotent).
	a.st.enrollSequences(ctx, env.OrgID, conv.ID, contactID)

	persisted := events.MessagePersisted{
		ConversationID: conv.ID,
		ContactID:      contactID,
		MessageID:      msgID,
		Direction:      "inbound",
		SenderType:     "contact",
		Type:           e.Message.Type,
		Body:           body,
		MediaURL:       e.Message.MediaURL,
		Preview:        mediaPreview(e.Message.Type, body),
	}
	a.log.Info("inbound persisted", "conv", conv.ID, "msg", msgID)
	if err := a.bus.Publish(events.SubjectMessagePersisted, env.OrgID, persisted); err != nil {
		return err
	}

	// Decision #2: a brand-new contact whose first message carried no campaign
	// signal (no CTWA referral, no keyword) cannot be attributed to a dealer. Ask
	// them which car/campaign they are interested in, ONCE, so a keyword in their
	// reply routes them. The conversation stays unassigned (manager/admin queue)
	// until then, so no agent sees an un-attributable lead.
	if createdNoSignal {
		a.promptCampaignChoice(ctx, env.OrgID, conv.ID)
	}
	return nil
}

// promptCampaignChoice asks an un-attributable new lead which car/brand they are
// interested in, so a keyword in their reply routes them to the right campaign
// (decision #2). Best-effort: it publishes a bot outbound and never blocks ingest.
func (a *app) promptCampaignChoice(ctx context.Context, orgID, convID string) {
	options := a.st.activeCampaignChoices(ctx, orgID)
	body := "Halo! Boleh tahu mobil apa yang Anda minati? Balas dengan nama mobil atau brand-nya ya."
	if options != "" {
		body = "Halo! Boleh tahu mobil apa yang Anda minati? Misalnya: " + options + ". Balas dengan nama mobil atau brand-nya ya."
	}
	if err := a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
		ConversationID: convID,
		SenderType:     "bot",
		Type:           "text",
		Body:           body,
	}); err != nil {
		a.log.Warn("campaign-choice prompt publish failed", "conv", convID, "err", err)
	}
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
	case e.MediaURL != "" && (e.Type == "image" || e.Type == "audio" || e.Type == "video" || e.Type == "document"):
		externalID, err = a.snd.sendMedia(ctx, target, e.Type, e.MediaURL, e.Body)
	default:
		externalID, err = a.snd.sendText(ctx, target, e.Body)
	}
	status := "sent"
	if err != nil {
		a.log.Error("wa send failed", "err", err)
		status = "failed"
	}
	msgID, err2 := a.st.insertOutbound(ctx, env.OrgID, convID, e.SenderType, e.SenderID, e.Type, e.Body, e.MediaURL, externalID, status, mediaPreview(e.Type, e.Body))
	if err2 != nil {
		return err2
	}

	persisted := events.MessagePersisted{
		ConversationID: convID,
		MessageID:      msgID,
		Direction:      "outbound",
		SenderType:     e.SenderType,
		Type:           e.Type,
		Body:           e.Body,
		MediaURL:       e.MediaURL,
		Preview:        mediaPreview(e.Type, e.Body),
	}
	a.log.Info("outbound persisted", "conv", convID, "msg", msgID, "status", status)
	return a.bus.Publish(events.SubjectMessagePersisted, env.OrgID, persisted)
}

// onStatusUpdated: handle Meta delivery/read receipts
func (a *app) onStatusUpdated(env events.Envelope) error {
	var e events.MessageStatusUpdated
	if err := json.Unmarshal(env.Data, &e); err != nil {
		a.log.Warn("decode status updated", "err", err)
		return nil
	}
	ctx := context.Background()

	convID, err := a.st.updateMessageStatus(ctx, e.ExternalID, e.Status)
	if err != nil {
		a.log.Warn("updateMessageStatus failed or not found", "ext_id", e.ExternalID, "err", err)
		return nil
	}

	a.log.Info("message status updated", "conv", convID, "ext_id", e.ExternalID, "status", e.Status)
	// Broadcast pseudo message.persisted to force UI refresh
	dummy := events.MessagePersisted{
		ConversationID: convID,
	}
	return a.bus.Publish(events.SubjectMessagePersisted, env.OrgID, dummy)
}

func preview(s string) string {
	r := []rune(s)
	if len(r) > 120 {
		return string(r[:120])
	}
	return s
}

// mediaPreview falls back to a type placeholder when a media message has no caption.
func mediaPreview(msgType, body string) string {
	if body != "" {
		return preview(body)
	}
	switch msgType {
	case "image":
		return "[image]"
	case "audio":
		return "[audio]"
	case "video":
		return "[video]"
	case "document":
		return "[document]"
	default:
		return ""
	}
}
