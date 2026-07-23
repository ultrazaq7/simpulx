package main

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/simpulx/v2/libs/go/broker"
	"github.com/simpulx/v2/libs/go/events"
)

type store struct {
	pool *pgxpool.Pool
	bus  *broker.Broker
}

type channelInfo struct {
	ID            string
	PhoneNumberID string
	AccessToken   string
}

// resolveChannel mengambil channel berdasarkan external ref: phone_number_id
// untuk WhatsApp, config.page_id / config.instagram_account_id untuk Meta, atau
// channel id (UUID) untuk Viber yang routing-nya lewat path /webhook/viber/{id}.
func (s *store) resolveChannel(ctx context.Context, externalRef string) (channelInfo, error) {
	var c channelInfo
	err := s.pool.QueryRow(ctx,
		`SELECT id, COALESCE(phone_number_id,''), COALESCE(access_token,'')
		   FROM channels
		  WHERE is_active
		    AND (phone_number_id = $1
		         OR config->>'page_id' = $1
		         OR config->>'instagram_account_id' = $1
		         OR id::text = $1)
		  LIMIT 1`,
		externalRef,
	).Scan(&c.ID, &c.PhoneNumberID, &c.AccessToken)
	return c, err
}

// upsertContact membuat/menemukan contact berdasarkan (org, phone).
func (s *store) upsertContact(ctx context.Context, orgID, phone, name, channel string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO contacts (organization_id, phone, full_name, source_channel, external_ids)
		 VALUES ($1, $2::text, NULLIF($3,''), $4, jsonb_build_object('wa_id', $2::text))
		 ON CONFLICT (organization_id, phone)
		 DO UPDATE SET full_name = COALESCE(NULLIF(EXCLUDED.full_name,''), contacts.full_name),
		               updated_at = now()
		 RETURNING id`,
		orgID, phone, name, channel,
	).Scan(&id)
	return id, err
}

// upsertContactExternal membuat/menemukan contact berdasarkan external id
// (PSID Messenger / IGSID Instagram) - kontak Meta tidak punya nomor telепon.
func (s *store) upsertContactExternal(ctx context.Context, orgID, externalID, name, channel string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM contacts
		  WHERE organization_id = $1 AND external_ids->>'psid' = $2 LIMIT 1`,
		orgID, externalID,
	).Scan(&id)
	if err == nil {
		if name != "" {
			_, _ = s.pool.Exec(ctx,
				`UPDATE contacts SET full_name = COALESCE(NULLIF($2,''), full_name), updated_at = now() WHERE id = $1`,
				id, name)
		}
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	err = s.pool.QueryRow(ctx,
		`INSERT INTO contacts (organization_id, full_name, source_channel, external_ids)
		 VALUES ($1, NULLIF($2,''), $3, jsonb_build_object('psid', $4::text))
		 RETURNING id`,
		orgID, name, channel, externalID,
	).Scan(&id)
	return id, err
}

type convInfo struct {
	ID          string
	IsBotActive bool
	AIAgentID   *string
	// Reopened is set when a closed thread was revived (status→open, stage reset)
	// on this inbound, so the caller can broadcast a status change for clients that
	// still show the thread as closed.
	Reopened bool
}

// reopenWindow: a thread closed within this window (except the 30-day dormant
// auto-close) is revived on the contact's next message instead of spawning a new
// lead instance. A customer returning within the month is the same lead.
const reopenWindow = "30 days"

// getOrCreateConversation menemukan percakapan open milik contact (lead instance
// paling baru aktif, lintas campaign), atau membuat baru. Dipakai untuk pesan
// TANPA sinyal campaign (decision #1: attach ke lead instance terakhir aktif).
// Mengembalikan created=true bila percakapan baru dibuat (lead no-signal benar2
// baru) -- caller memakai ini untuk decision #2 (kirim prompt pilih campaign).
//
// Uses pg_advisory_xact_lock to serialize concurrent calls for the same
// (org, contact) pair, preventing duplicate conversation creation.
func (s *store) getOrCreateConversation(ctx context.Context, orgID, contactID, channel, channelID string) (convInfo, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return convInfo{}, false, err
	}
	defer tx.Rollback(ctx)

	// Advisory lock on hash of orgID+contactID - serializes concurrent webhooks
	// for the same contact. Released automatically on tx.Commit/Rollback.
	_, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1 || $2))`, orgID, contactID)
	if err != nil {
		return convInfo{}, false, err
	}

	// 3.2 Lead Re-entry: Auto-close dormant threads (>30 days) to allow fresh prompt
	_, _ = tx.Exec(ctx,
		`UPDATE conversations SET status='closed', closed_reason='dormant_30d', closed_at=now(), updated_at=now()
		 WHERE organization_id=$1 AND contact_id=$2 AND status<>'closed' 
		   AND last_message_at < now() - interval '30 days'`,
		orgID, contactID)

	var ci convInfo
	err = tx.QueryRow(ctx,
		`SELECT id, is_bot_active, ai_agent_id
		   FROM conversations
		  WHERE organization_id = $1 AND contact_id = $2 AND status <> 'closed'
		  ORDER BY last_message_at DESC NULLS LAST
		  LIMIT 1`,
		orgID, contactID,
	).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		_ = tx.Commit(ctx)
		return ci, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, false, err
	}
	// Re-entry within the reopen window: revive the most recent recently-closed
	// thread (not the 30-day dormant close) rather than splitting off a new
	// instance, so a quick continuation stays in the same conversation.
	err = tx.QueryRow(ctx,
		`UPDATE conversations
		    SET status='open', closed_at=NULL, closed_reason=NULL,
		        stage_id = COALESCE(
		          (SELECT id FROM stages WHERE organization_id=$1 AND sort_order=1 LIMIT 1),
		          stage_id),
		        disposition_id = NULL,
		        lost_reason = NULL,
		        classification_locked = false,
		        updated_at=now()
		  WHERE id = (
		      SELECT id FROM conversations
		       WHERE organization_id=$1 AND contact_id=$2 AND status='closed'
		         AND closed_reason IS DISTINCT FROM 'dormant_30d'
		         AND (closed_at IS NULL OR closed_at > now() - $3::interval)
		       ORDER BY last_message_at DESC NULLS LAST LIMIT 1)
		  RETURNING id, is_bot_active, ai_agent_id`,
		orgID, contactID, reopenWindow,
	).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		ci.Reopened = true
		_ = tx.Commit(ctx)
		return ci, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, false, err
	}
	// buat baru (lead no-signal baru, belum ter-attribute ke campaign manapun)
	err = tx.QueryRow(ctx,
		`INSERT INTO conversations (organization_id, contact_id, channel, channel_id, status, is_bot_active, ai_agent_id, stage_id)
		 VALUES ($1, $2, $3, NULLIF($4,'')::uuid, 'open', true,
		         (SELECT id FROM ai_agents WHERE organization_id = $1 AND is_active ORDER BY created_at LIMIT 1),
		         (SELECT id FROM stages WHERE organization_id = $1 AND system_key = 'new' LIMIT 1))
		 RETURNING id, is_bot_active, ai_agent_id`,
		orgID, contactID, channel, channelID,
	).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err != nil {
		return ci, false, err
	}
	_ = tx.Commit(ctx)
	return ci, true, nil
}

// insertInbound menyimpan pesan masuk + reset window WA 24 jam.
// Memakai Transaction untuk Idempotency dan Outbox pattern.
func (s *store) insertInbound(ctx context.Context, orgID, convID, msgType, body, mediaURL, externalID string, genuine bool, previewText, metaJSON string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var msgID string
	if externalID != "" {
		var exists string
		err = tx.QueryRow(ctx, "SELECT id FROM messages WHERE organization_id = $1 AND external_id = $2 LIMIT 1", orgID, externalID).Scan(&exists)
		if err == nil {
			return "", errors.New("duplicate message")
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, media_url, external_id, status, genuine, metadata)
		 VALUES ($1, $2, 'inbound', 'contact', $3, $4, NULLIF($5,''), $6, 'delivered', $7, COALESCE(NULLIF($8,'')::jsonb,'{}'))
		 RETURNING id`,
		orgID, convID, msgType, body, mediaURL, externalID, genuine, metaJSON,
	).Scan(&msgID)

	if err != nil {
		return "", err
	}

	var assignedAgentID *string
	var newUnreadCount int
	err = tx.QueryRow(ctx,
		`UPDATE conversations
		    SET last_message_at = now(),
		        last_contact_message_at = now(),
		        window_expires_at = now() + interval '24 hours',
		        last_message_preview = LEFT($2, 200),
		        unread_count = unread_count + 1,
		        status = CASE WHEN status = 'snoozed' THEN 'open' ELSE status END,
		        snoozed_until = CASE WHEN status = 'snoozed' THEN NULL ELSE snoozed_until END,
		        -- A fresh customer message restarts the follow-up reminder cadence.
		        followup_notify_count = 0,
		        last_followup_notified_at = NULL,
		        -- A fresh customer message also restarts the AI auto-follow-up
		        -- cadence; this stops an engaged (re-replying) lead being ghosted.
		        followup_count = 0,
		        updated_at = now()
		  WHERE id = $1 RETURNING assigned_agent_id, unread_count`,
		convID, previewText,
	).Scan(&assignedAgentID, &newUnreadCount)
	if err != nil {
		return "", err
	}

	payload := map[string]interface{}{
		"conversation_id":   convID,
		"message_id":        msgID,
		"direction":         "inbound",
		"sender_type":       "contact",
		"type":              msgType,
		"body":              body,
		"media_url":         mediaURL,
		"preview":           previewText,
		"assigned_agent_id": assignedAgentID,
		"unread_count":      newUnreadCount,
	}
	if metaJSON != "" {
		payload["metadata"] = json.RawMessage(metaJSON)
	}
	payloadBytes, _ := json.Marshal(payload)
	_, err = tx.Exec(ctx,
		`INSERT INTO outbox_events (organization_id, topic, payload) VALUES ($1, 'events.message.persisted', $2)`,
		orgID, payloadBytes,
	)
	if err != nil {
		return "", err
	}

	return msgID, tx.Commit(ctx)
}

// insertOutbound menyimpan pesan keluar (bot/agent).
func (s *store) insertOutbound(ctx context.Context, orgID, convID, senderType, senderID, msgType, body, mediaURL, externalID, status string, previewText string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var msgID string
	var sid any
	if senderID != "" {
		sid = senderID
	}

	if externalID != "" {
		var exists string
		err = tx.QueryRow(ctx, "SELECT id FROM messages WHERE organization_id = $1 AND external_id = $2 LIMIT 1", orgID, externalID).Scan(&exists)
		if err == nil {
			return "", errors.New("duplicate message")
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, sender_id, type, body, media_url, external_id, status)
		 VALUES ($1, $2, 'outbound', $3, $4, $5, $6, NULLIF($7,''), NULLIF($8,''), $9)
		 RETURNING id`,
		orgID, convID, senderType, sid, msgType, body, mediaURL, externalID, status,
	).Scan(&msgID)

	if err != nil {
		return "", err
	}

	// Meter Simpuler credits (WS-F): each bot (AI) reply debits 1 credit from the
	// conversation's campaign. Agent/system/broadcast sends are not metered.
	if senderType == "bot" {
		_, _ = tx.Exec(ctx,
			`UPDATE campaign_credits SET used_credits = used_credits + 1, updated_at = now()
			  WHERE campaign_id = (SELECT campaign_id FROM conversations WHERE id = $1)`,
			convID)
	}

	var assignedAgentID *string
	err = tx.QueryRow(ctx,
		`UPDATE conversations
		    SET last_message_at = now(),
		        last_agent_message_at = now(),
		        last_message_preview = LEFT($2, 200),
		        updated_at = now()
		  WHERE id = $1 RETURNING assigned_agent_id`,
		convID, previewText,
	).Scan(&assignedAgentID)
	if err != nil {
		return "", err
	}

	payload := map[string]interface{}{
		"conversation_id":   convID,
		"message_id":        msgID,
		"direction":         "outbound",
		"sender_type":       senderType,
		"type":              msgType,
		"body":              body,
		"media_url":         mediaURL,
		"preview":           previewText,
		"assigned_agent_id": assignedAgentID,
	}
	payloadBytes, _ := json.Marshal(payload)
	_, err = tx.Exec(ctx,
		`INSERT INTO outbox_events (organization_id, topic, payload) VALUES ($1, 'events.message.persisted', $2)`,
		orgID, payloadBytes,
	)
	if err != nil {
		return "", err
	}

	return msgID, tx.Commit(ctx)
}

// linkBroadcastRecipient menautkan baris broadcast_recipients ke message yang
// baru dibuat, agar laporan broadcast membaca status delivered/read langsung
// dari messages via FK (bukan join time-window).
func (s *store) linkBroadcastRecipient(ctx context.Context, recipID, msgID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE broadcast_recipients SET message_id=$2 WHERE id=$1`, recipID, msgID)
	return err
}

// getOrCreateThread mendukung MULTI-THREAD: satu contact bisa punya beberapa
// percakapan paralel, satu per campaign. Dipakai saat ada CTWA ad click yang
// memetakan ke campaign - buka/lanjutkan thread khusus campaign itu (tidak
// menimpa thread campaign lain milik contact yang sama). Thread baru langsung
// di-assign round-robin ke agent campaign.
//
// Uses pg_advisory_xact_lock to serialize concurrent calls for the same
// (org, contact, campaign) triple, preventing duplicate thread creation.
func (s *store) getOrCreateThread(ctx context.Context, orgID, contactID, channel, channelID, campaignID, branchID string) (convInfo, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return convInfo{}, err
	}
	defer tx.Rollback(ctx)

	// Advisory lock on hash of orgID+contactID - deliberately the SAME key as
	// getOrCreateConversation, and deliberately NOT including campaignID. The
	// unique indexes from 0023 guard per-CONTACT invariants, so the no-signal
	// path and the campaign path must serialize against each other, not only
	// against themselves. With campaignID in the key the two paths raced: both
	// passed their SELECTs and both inserted a campaign-NULL row (the campaign
	// tag lands post-commit in routeThread), and the second insert died on
	// idx_conv_active_contact_no_campaign with SQLSTATE 23505.
	_, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1 || $2))`, orgID, contactID)
	if err != nil {
		return convInfo{}, err
	}

	// 3.2 Lead Re-entry: Auto-close dormant threads (>30 days) to allow fresh instance
	_, _ = tx.Exec(ctx,
		`UPDATE conversations SET status='closed', closed_reason='dormant_30d', closed_at=now(), updated_at=now()
		 WHERE organization_id=$1 AND contact_id=$2 AND status<>'closed' 
		   AND last_message_at < now() - interval '30 days'`,
		orgID, contactID)

	var ci convInfo
	// 1) Reuse an open thread already tied to THIS branch (if any) else THIS campaign.
	err = tx.QueryRow(ctx,
		`SELECT id, is_bot_active, ai_agent_id FROM conversations
		  WHERE organization_id=$1 AND contact_id=$2 AND status<>'closed'
		    AND CASE WHEN $4 <> '' THEN branch_id = NULLIF($4,'')::uuid ELSE campaign_id = $3 END
		  ORDER BY last_message_at DESC NULLS LAST LIMIT 1`,
		orgID, contactID, campaignID, branchID).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		_ = tx.Commit(ctx)
		return ci, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, err
	}
	// 2) Adopt an existing open thread that has NO campaign yet (e.g. a generic
	// opener that arrived before any keyword) instead of splitting it off.
	err = tx.QueryRow(ctx,
		`SELECT id, is_bot_active, ai_agent_id FROM conversations
		  WHERE organization_id=$1 AND contact_id=$2 AND status<>'closed' AND campaign_id IS NULL
		  ORDER BY last_message_at DESC NULLS LAST LIMIT 1`,
		orgID, contactID).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		_ = tx.Commit(ctx)
		s.routeThread(ctx, campaignID, branchID, ci.ID) // tag branch/campaign + round-robin assign
		return ci, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, err
	}
	// 2.5) Re-entry within the reopen window: revive a recently-closed thread for
	// THIS branch/campaign (not the 30-day dormant close) instead of creating a new
	// instance. Keeps the existing agent assignment and campaign tagging.
	err = tx.QueryRow(ctx,
		`UPDATE conversations
		    SET status='open', closed_at=NULL, closed_reason=NULL,
		        stage_id = COALESCE(
		          (SELECT id FROM stages WHERE organization_id=$1 AND sort_order=1 LIMIT 1),
		          stage_id),
		        disposition_id = NULL,
		        lost_reason = NULL,
		        classification_locked = false,
		        updated_at=now()
		  WHERE id = (
		      SELECT id FROM conversations
		       WHERE organization_id=$1 AND contact_id=$2 AND status='closed'
		         AND closed_reason IS DISTINCT FROM 'dormant_30d'
		         AND (closed_at IS NULL OR closed_at > now() - $5::interval)
		         AND CASE WHEN $4 <> '' THEN branch_id = NULLIF($4,'')::uuid ELSE campaign_id = $3 END
		       ORDER BY last_message_at DESC NULLS LAST LIMIT 1)
		  RETURNING id, is_bot_active, ai_agent_id`,
		orgID, contactID, campaignID, branchID, reopenWindow).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		_ = tx.Commit(ctx)
		return ci, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, err
	}
	// 3) No reusable thread -> create a fresh one for this campaign.
	err = tx.QueryRow(ctx,
		`INSERT INTO conversations (organization_id, contact_id, channel, channel_id, status, is_bot_active, ai_agent_id, stage_id)
		 VALUES ($1, $2, $3, NULLIF($4,'')::uuid, 'open', true,
		         (SELECT id FROM ai_agents WHERE organization_id = $1 AND is_active ORDER BY created_at LIMIT 1),
		         (SELECT id FROM stages WHERE organization_id = $1 AND system_key = 'new' LIMIT 1))
		 RETURNING id, is_bot_active, ai_agent_id`,
		orgID, contactID, channel, channelID).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err != nil {
		return ci, err
	}
	_ = tx.Commit(ctx)
	s.routeThread(ctx, campaignID, branchID, ci.ID) // set branch/campaign + round-robin assign
	return ci, nil
}

// resolveCampaignByReferral memetakan CTWA ad source_id ke campaign aktif.
func (s *store) resolveCampaignByReferral(ctx context.Context, orgID, referral string) (string, bool) {
	if referral == "" {
		return "", false
	}
	var id string
	// 1) Explicit override: the ad id was typed into the campaign.
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM campaigns
		  WHERE organization_id=$1 AND status='active' AND $2 = ANY(ad_source_ids) LIMIT 1`,
		orgID, referral).Scan(&id)
	if err == nil {
		return id, true
	}
	// 2) Otherwise route through the MAPPING: this ad belongs to a Meta campaign,
	// and that Meta campaign is already mapped to one of ours.
	//
	// Without this, every ad created in Ads Manager is a routing gap until someone
	// remembers to paste its id into the campaign. Such a lead is not lost, but it
	// arrives with no campaign -- no catalogue grounding, no service area, no AI
	// style, no round-robin -- and waits unassigned in the admin queue. Deriving it
	// closes the gap the moment the ad is synced, with nobody typing anything.
	err = s.pool.QueryRow(ctx,
		`SELECT c.id::text
		   FROM ad_creatives cr
		   JOIN ad_campaigns ac
		     ON ac.organization_id = cr.organization_id
		    AND ac.external_id = cr.campaign_external_id
		   JOIN ad_campaign_campaigns m ON m.ad_campaign_id = ac.id
		   JOIN campaigns c ON c.id = m.campaign_id
		  WHERE cr.organization_id = $1
		    AND cr.ad_external_id = $2
		    AND cr.campaign_external_id IS NOT NULL
		    AND c.status = 'active'
		  LIMIT 1`,
		orgID, referral).Scan(&id)
	return id, err == nil
}

// adCreative carries the CTWA ad creative preview (image + copy) that Meta
// includes in the referral object for image/video ads.
type adCreative struct {
	ImageURL, Headline, Body, MediaType string
}

// recordAttribution menyimpan jejak klik iklan (referral) ke dalam multi-touch attribution.
func (s *store) recordAttribution(ctx context.Context, orgID, convID, campaignID, referral, referralURL, ctwaClid string, cr adCreative) error {
	var cid any
	if campaignID != "" {
		cid = campaignID
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO conversation_attributions
		   (organization_id, conversation_id, campaign_id, referral_source, referral_url,
		    referral_image_url, referral_headline, referral_body, referral_media_type, ctwa_clid)
		 VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''),
		         NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), NULLIF($10, ''))`,
		orgID, convID, cid, referral, referralURL,
		cr.ImageURL, cr.Headline, cr.Body, cr.MediaType, ctwaClid,
	)
	return err
}

// listingURLRe matches a unit link from a property microsite: /listing/{org}/{unit}.
// Host-agnostic on purpose (custom domains are planned) -- the two slugs are the
// identifying part, and both are scoped to the org before anything is trusted.
var listingURLRe = regexp.MustCompile(`/listing/([a-z0-9\-]+)/([a-z0-9\-]+)`)

// resolveListingByURL maps an inbound message that carries a microsite unit link
// back to that listing, and to the campaign the unit belongs to.
//
// This is the attribution path for the property e-catalog. The microsite's
// WhatsApp button prefills the message with the unit's own link, so the signal is
// already there in what the buyer sends -- nothing artificial (a tracking keyword
// or code) has to be injected into their text. It is also strictly better than a
// campaign keyword: it identifies the exact UNIT, so the sales team sees which
// property the buyer was looking at, not just which campaign.
//
// The org slug in the URL must match the receiving org, so a link pasted from a
// different tenant's site can never route a lead into this one.
func (s *store) resolveListingByURL(ctx context.Context, orgID, text string) (listingID, campaignID, title string, ok bool) {
	m := listingURLRe.FindStringSubmatch(strings.ToLower(text))
	if m == nil {
		return "", "", "", false
	}
	var cid *string
	err := s.pool.QueryRow(ctx,
		`SELECT l.id::text, l.campaign_id::text, l.title
		   FROM listings l JOIN organizations o ON o.id = l.organization_id
		  WHERE o.id = $1 AND o.slug = $2 AND l.slug = $3 AND l.status = 'published'
		  LIMIT 1`, orgID, m[1], m[2]).Scan(&listingID, &cid, &title)
	if err != nil {
		return "", "", "", false
	}
	if cid != nil {
		campaignID = *cid
	}
	return listingID, campaignID, title, true
}

// attachListing records the microsite unit a lead arrived from on the conversation.
// Only ever set once (the FIRST unit that produced the contact), because that is the
// attribution fact; a buyer who later asks about other units is normal browsing and
// must not overwrite where the lead actually came from. Best-effort: attribution is
// never worth failing an inbound message over.
func (s *store) attachListing(ctx context.Context, convID, listingID, title string) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE conversations
		    SET metadata = COALESCE(metadata,'{}'::jsonb)
		                 || jsonb_build_object('source_listing',
		                      jsonb_build_object('id', $2::text, 'title', $3::text)),
		        updated_at = now()
		  WHERE id = $1 AND metadata->'source_listing' IS NULL`,
		convID, listingID, title)
}

// resolveCampaignByKeyword: cocokkan keyword campaign aktif yang terkandung di
// teks pesan. Dipanggil SEBELUM memilih conversation, sehingga pesan dengan
// keyword campaign lain membuka thread campaign tersebut (bukan menempel pada
// thread lama milik contact yang sama).
func (s *store) resolveCampaignByKeyword(ctx context.Context, orgID, text string) (string, bool) {
	if strings.TrimSpace(text) == "" {
		return "", false
	}
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM campaigns
		  WHERE organization_id=$1 AND status='active'
		    AND EXISTS (SELECT 1 FROM unnest(keywords) k WHERE position(lower(k) in lower($2)) > 0)
		  ORDER BY created_at LIMIT 1`,
		orgID, text).Scan(&id)
	return id, err == nil
}

// ensureAssigned picks up an UNASSIGNED but already-routed conversation (it has a
// campaign or branch) and assigns it to the least-loaded eligible agent. No-op if
// it already has an agent, isn't routed yet, or no agent qualifies. This lets a
// lead that was left unassigned at first touch (e.g. every agent was inactive)
// get an owner on the contact's next message instead of sitting forever.
// announceAssigned publishes conversation.assigned so realtime clients (mobile +
// web) update the instant a lead is routed, instead of waiting on the slower
// message.persisted refetch. Best-effort; never blocks ingest.
func (s *store) announceAssigned(ctx context.Context, orgID, convID, agentID string) {
	if s.bus == nil || agentID == "" || orgID == "" {
		return
	}
	var name string
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(full_name,'') FROM users WHERE id=$1`, agentID).Scan(&name)
	_ = s.bus.Publish(events.SubjectConversationAssigned, orgID, events.ConversationAssigned{
		ConversationID: convID,
		AgentID:        agentID,
		AgentName:      name,
	})
}

// ensureAssigned gives a campaign/branch-routed but still-unassigned open
// conversation an owner immediately (campaign/branch round-robin), so an
// attributed lead never sits waiting when no agent was eligible at first touch.
//
// Un-attributed leads (no campaign, no branch) are intentionally LEFT unassigned
// in the manager/admin queue until a keyword routes them into a campaign - see
// 14-fair-distribution-engine, decision #2. There is deliberately NO org-wide
// fallback: assignment happens only through campaign/branch round-robin, never by
// silently handing a no-signal lead to the least-loaded agent.
// On success it announces the assignment in realtime.
func (s *store) ensureAssigned(ctx context.Context, convID string) {
	var agentID, orgID string
	// Campaign/branch-scoped rotation only.
	err := s.pool.QueryRow(ctx,
		`WITH c AS (
		     SELECT organization_id, campaign_id, branch_id FROM conversations
		      WHERE id=$1 AND assigned_agent_id IS NULL AND status<>'closed'
		        AND (campaign_id IS NOT NULL OR branch_id IS NOT NULL)
		 ), pick AS (
		     SELECT u.id AS user_id FROM users u, c
		      WHERE u.organization_id=c.organization_id AND u.is_deleted=false AND u.status='active'
		        AND ( (c.branch_id IS NOT NULL AND u.id IN (SELECT user_id FROM branch_agents WHERE branch_id=c.branch_id AND in_rotation))
		           OR (c.branch_id IS NULL AND u.id IN (SELECT user_id FROM campaign_agents WHERE campaign_id=c.campaign_id AND in_rotation)) )
		      ORDER BY (SELECT count(*) FROM conversations cc WHERE cc.assigned_agent_id=u.id AND cc.status<>'closed') ASC, u.id
		      LIMIT 1)
		 UPDATE conversations SET assigned_agent_id=(SELECT user_id FROM pick), updated_at=now()
		  WHERE id=$1 AND assigned_agent_id IS NULL AND EXISTS (SELECT 1 FROM pick)
		  RETURNING assigned_agent_id::text, organization_id::text`,
		convID).Scan(&agentID, &orgID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return
	}
	if agentID != "" {
		s.announceAssigned(ctx, orgID, convID, agentID)
	}
}

// routeToCampaign: set campaign + assign agent berikutnya secara round-robin.
// Counter (rr_cursor, lead_count) hanya naik bila percakapan benar-benar baru
// di-route (UPDATE mengenai 1 baris). Tanpa guard ini, rr_cursor ikut naik walau
// conversation sudah ter-attribute -> agent ke-skip & assignment jadi tak akurat.
func (s *store) routeToCampaign(ctx context.Context, campaignID string, convID string) {
	if campaignID == "" {
		return
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)

	// Lock the conversation to check its current state safely
	var currAgent *string
	var orgID string
	err = tx.QueryRow(ctx, `SELECT assigned_agent_id, organization_id FROM conversations WHERE id = $1 FOR UPDATE`, convID).Scan(&currAgent, &orgID)
	if err != nil {
		return
	}

	// 4.1 Round-Robin Bypass: If the lead already has an agent (e.g. adopted open generic thread),
	// just tag the campaign but DO NOT advance the RR cursor! Unfair distribution prevented.
	if currAgent != nil {
		_, _ = tx.Exec(ctx, `UPDATE conversations SET campaign_id = $1, updated_at = now() WHERE id = $2 AND campaign_id IS NULL`, campaignID, convID)
		_ = tx.Commit(ctx)
		return
	}

	// Lock the campaign row to serialize concurrent picks for fair distribution.
	if _, err = tx.Exec(ctx, `SELECT 1 FROM campaigns WHERE id = $1 FOR UPDATE`, campaignID); err != nil {
		return
	}

	// Workload-aware: assign to the eligible agent with the fewest OPEN chats
	// (tiebreak by id for stability), so load stays balanced instead of pure RR.
	var assignedAgent string
	err = tx.QueryRow(ctx,
		`SELECT ca.user_id FROM campaign_agents ca JOIN users u ON u.id=ca.user_id
		  WHERE ca.campaign_id=$1 AND ca.in_rotation AND u.is_deleted=false AND u.status='active'
		  ORDER BY (SELECT count(*) FROM conversations cc WHERE cc.assigned_agent_id=ca.user_id AND cc.status<>'closed') ASC, ca.user_id
		  LIMIT 1`,
		campaignID).Scan(&assignedAgent)

	didAssign := false
	if err == nil && assignedAgent != "" {
		tag, err := tx.Exec(ctx,
			`UPDATE conversations
			 SET campaign_id = $1, assigned_agent_id = $2, updated_at = now()
			 WHERE id = $3 AND campaign_id IS NULL`,
			campaignID, assignedAgent, convID)

		// Only advance cursor if we actually updated the row (i.e. campaign_id was NULL)
		if err == nil && tag.RowsAffected() > 0 {
			didAssign = true
			_, _ = tx.Exec(ctx, `UPDATE campaigns SET rr_cursor = rr_cursor + 1, lead_count = lead_count + 1 WHERE id = $1`, campaignID)

			// 6.1 Audit Trail Event Sourcing
			_, _ = tx.Exec(ctx, `
				INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, detail)
				SELECT organization_id, id, 'assigned', 'system', jsonb_build_object('assigned_agent_id', $1::uuid, 'campaign_id', $2::uuid)
				FROM conversations WHERE id = $3
			`, assignedAgent, campaignID, convID)

			if s.bus != nil {
				_ = s.bus.Publish(events.SubjectAuditCreated, orgID, events.AuditCreated{
					ConversationID: convID,
					Type:           "assigned",
					ActorType:      "system",
					Detail: map[string]any{
						"assigned_agent_id": assignedAgent,
						"campaign_id":       campaignID,
					},
				})
			}
		}
	}

	_ = tx.Commit(ctx)
	if didAssign {
		s.announceAssigned(ctx, orgID, convID, assignedAgent)
	}
}

// routeThread routes a conversation to a branch when one is given, else to the
// campaign. Branch is the more specific routing unit (its own agents + cursor).
func (s *store) routeThread(ctx context.Context, campaignID, branchID, convID string) {
	if branchID != "" {
		s.routeToBranch(ctx, branchID, convID)
		return
	}
	s.routeToCampaign(ctx, campaignID, convID)
}

// resolveBranchByReferral maps a CTWA ad source_id to an active branch, returning
// the branch + its parent campaign. Checked before resolveCampaignByReferral so a
// branch's ad source wins over a campaign-level one.
func (s *store) resolveBranchByReferral(ctx context.Context, orgID, referral string) (branchID, campaignID string, ok bool) {
	if referral == "" {
		return "", "", false
	}
	err := s.pool.QueryRow(ctx,
		`SELECT d.id::text, d.campaign_id::text
		   FROM campaign_branches d JOIN campaigns c ON c.id = d.campaign_id
		  WHERE d.organization_id=$1 AND c.status='active' AND $2 = ANY(d.ad_source_ids)
		  LIMIT 1`,
		orgID, referral).Scan(&branchID, &campaignID)
	return branchID, campaignID, err == nil
}

// routeToBranch mirrors routeToCampaign's fair-distribution logic (locked
// rr_cursor + per-unit agents) but on a branch. It also tags the branch's parent
// campaign on the conversation so campaign-level reporting still works.
func (s *store) routeToBranch(ctx context.Context, branchID string, convID string) {
	if branchID == "" {
		return
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)

	var currAgent *string
	var orgID string
	err = tx.QueryRow(ctx, `SELECT assigned_agent_id, organization_id FROM conversations WHERE id = $1 FOR UPDATE`, convID).Scan(&currAgent, &orgID)
	if err != nil {
		return
	}

	// Lock the branch (read its parent campaign) to serialize concurrent picks.
	var campaignID string
	err = tx.QueryRow(ctx, `SELECT campaign_id::text FROM campaign_branches WHERE id = $1 FOR UPDATE`, branchID).Scan(&campaignID)
	if err != nil {
		return
	}

	// Already assigned (e.g. adopted an open generic thread) -> tag only, no RR advance.
	if currAgent != nil {
		_, _ = tx.Exec(ctx, `UPDATE conversations SET branch_id = $1, campaign_id = $2, updated_at = now() WHERE id = $3 AND campaign_id IS NULL`, branchID, campaignID, convID)
		_ = tx.Commit(ctx)
		return
	}

	var assignedAgent string
	err = tx.QueryRow(ctx,
		`SELECT ba.user_id FROM branch_agents ba JOIN users u ON u.id=ba.user_id
		  WHERE ba.branch_id=$1 AND ba.in_rotation AND u.is_deleted=false AND u.status='active'
		  ORDER BY (SELECT count(*) FROM conversations cc WHERE cc.assigned_agent_id=ba.user_id AND cc.status<>'closed') ASC, ba.user_id
		  LIMIT 1`,
		branchID).Scan(&assignedAgent)

	didAssign := false
	if err == nil && assignedAgent != "" {
		tag, err := tx.Exec(ctx,
			`UPDATE conversations
			 SET branch_id = $1, campaign_id = $2, assigned_agent_id = $3, updated_at = now()
			 WHERE id = $4 AND campaign_id IS NULL`,
			branchID, campaignID, assignedAgent, convID)

		if err == nil && tag.RowsAffected() > 0 {
			didAssign = true
			_, _ = tx.Exec(ctx, `UPDATE campaign_branches SET rr_cursor = rr_cursor + 1, lead_count = lead_count + 1 WHERE id = $1`, branchID)

			_, _ = tx.Exec(ctx, `
				INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, detail)
				SELECT organization_id, id, 'assigned', 'system', jsonb_build_object('assigned_agent_id', $1::uuid, 'campaign_id', $2::uuid, 'branch_id', $3::uuid)
				FROM conversations WHERE id = $4
			`, assignedAgent, campaignID, branchID, convID)

			if s.bus != nil {
				_ = s.bus.Publish(events.SubjectAuditCreated, orgID, events.AuditCreated{
					ConversationID: convID,
					Type:           "assigned",
					ActorType:      "system",
					Detail: map[string]any{
						"assigned_agent_id": assignedAgent,
						"campaign_id":       campaignID,
						"branch_id":         branchID,
					},
				})
			}
		}
	}

	_ = tx.Commit(ctx)
	if didAssign {
		s.announceAssigned(ctx, orgID, convID, assignedAgent)
	}
}

// sendTarget mengambil data yang diperlukan untuk mengirim outbound. ChannelType
// memilih sender (whatsapp vs viber); ExternalID = psid/Viber user id untuk
// channel non-WhatsApp (kontak Viber tidak punya nomor telepon).
type sendTarget struct {
	OrgID         string
	ContactPhone  string
	PhoneNumberID string
	AccessToken   string
	ChannelType   string
	ChannelName   string
	ExternalID    string
}

func (s *store) sendTarget(ctx context.Context, convID string) (sendTarget, error) {
	var t sendTarget
	err := s.pool.QueryRow(ctx,
		`SELECT cv.organization_id, COALESCE(ct.phone,''),
		        COALESCE(ch.phone_number_id,''), COALESCE(ch.access_token,''),
		        COALESCE(ch.type,''), COALESCE(ch.name,''),
		        COALESCE(ct.external_ids->>'psid','')
		   FROM conversations cv
		   JOIN contacts ct ON ct.id = cv.contact_id
		   LEFT JOIN channels ch ON ch.id = cv.channel_id
		  WHERE cv.id = $1`,
		convID,
	).Scan(&t.OrgID, &t.ContactPhone, &t.PhoneNumberID, &t.AccessToken, &t.ChannelType, &t.ChannelName, &t.ExternalID)
	return t, err
}

// updateMessageStatus updates the status of an outbound message matched by
// externalID and returns the internal message id + conversation id so the caller
// can broadcast a precise tick update (sent→delivered→read) to clients.
func (s *store) updateMessageStatus(ctx context.Context, externalID, status string) (msgID, convID string, err error) {
	err = s.pool.QueryRow(ctx,
		`UPDATE messages SET status = $2 WHERE external_id = $1 RETURNING id::text, conversation_id::text`,
		externalID, status).Scan(&msgID, &convID)
	return msgID, convID, err
}
