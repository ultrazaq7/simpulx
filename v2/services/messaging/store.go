package main

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type store struct{ pool *pgxpool.Pool }

type channelInfo struct {
	ID            string
	PhoneNumberID string
	AccessToken   string
}

// resolveChannel mengambil channel berdasarkan external ref: phone_number_id
// untuk WhatsApp, atau config.page_id / config.instagram_account_id untuk Meta.
func (s *store) resolveChannel(ctx context.Context, externalRef string) (channelInfo, error) {
	var c channelInfo
	err := s.pool.QueryRow(ctx,
		`SELECT id, COALESCE(phone_number_id,''), COALESCE(access_token,'')
		   FROM channels
		  WHERE is_active
		    AND (phone_number_id = $1
		         OR config->>'page_id' = $1
		         OR config->>'instagram_account_id' = $1)
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
// (PSID Messenger / IGSID Instagram) — kontak Meta tidak punya nomor telепon.
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
}

// getOrCreateConversation menemukan percakapan open milik contact (lead instance
// paling baru aktif, lintas campaign), atau membuat baru. Dipakai untuk pesan
// TANPA sinyal campaign (decision #1: attach ke lead instance terakhir aktif).
// Mengembalikan created=true bila percakapan baru dibuat (lead no-signal benar2
// baru) -- caller memakai ini untuk decision #2 (kirim prompt pilih campaign).
func (s *store) getOrCreateConversation(ctx context.Context, orgID, contactID, channel, channelID string) (convInfo, bool, error) {
	var ci convInfo
	err := s.pool.QueryRow(ctx,
		`SELECT id, is_bot_active, ai_agent_id
		   FROM conversations
		  WHERE organization_id = $1 AND contact_id = $2 AND status <> 'closed'
		  ORDER BY last_message_at DESC NULLS LAST
		  LIMIT 1`,
		orgID, contactID,
	).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		return ci, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, false, err
	}
	// buat baru (lead no-signal baru, belum ter-attribute ke campaign manapun)
	err = s.pool.QueryRow(ctx,
		`INSERT INTO conversations (organization_id, contact_id, channel, channel_id, status, is_bot_active, ai_agent_id)
		 VALUES ($1, $2, $3, NULLIF($4,'')::uuid, 'open', true,
		         (SELECT id FROM ai_agents WHERE organization_id = $1 AND is_active ORDER BY created_at LIMIT 1))
		 RETURNING id, is_bot_active, ai_agent_id`,
		orgID, contactID, channel, channelID,
	).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	return ci, err == nil, err
}

// insertInbound menyimpan pesan masuk + reset window WA 24 jam.
func (s *store) insertInbound(ctx context.Context, orgID, convID, msgType, body, mediaURL, externalID string, genuine bool, previewText string) (string, error) {
	var msgID string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, media_url, external_id, status, genuine)
		 VALUES ($1, $2, 'inbound', 'contact', $3, $4, NULLIF($5,''), $6, 'delivered', $7)
		 RETURNING id`,
		orgID, convID, msgType, body, mediaURL, externalID, genuine,
	).Scan(&msgID)
	if err != nil {
		return "", err
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE conversations
		    SET last_message_at = now(),
		        last_contact_message_at = now(),
		        window_expires_at = now() + interval '24 hours',
		        last_message_preview = LEFT($2, 200),
		        unread_count = unread_count + 1,
		        updated_at = now()
		  WHERE id = $1`,
		convID, previewText,
	)
	return msgID, err
}

// insertOutbound menyimpan pesan keluar (bot/agent).
func (s *store) insertOutbound(ctx context.Context, orgID, convID, senderType, senderID, msgType, body, mediaURL, externalID, status string, previewText string) (string, error) {
	var msgID string
	var sid any
	if senderID != "" {
		sid = senderID
	}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, sender_id, type, body, media_url, external_id, status)
		 VALUES ($1, $2, 'outbound', $3, $4, $5, $6, NULLIF($7,''), NULLIF($8,''), $9)
		 RETURNING id`,
		orgID, convID, senderType, sid, msgType, body, mediaURL, externalID, status,
	).Scan(&msgID)
	if err != nil {
		return "", err
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE conversations
		    SET last_message_at = now(),
		        last_agent_message_at = now(),
		        last_message_preview = LEFT($2, 200),
		        updated_at = now()
		  WHERE id = $1`,
		convID, previewText,
	)
	return msgID, err
}

// getOrCreateThread mendukung MULTI-THREAD: satu contact bisa punya beberapa
// percakapan paralel, satu per campaign. Dipakai saat ada CTWA ad click yang
// memetakan ke campaign — buka/lanjutkan thread khusus campaign itu (tidak
// menimpa thread campaign lain milik contact yang sama). Thread baru langsung
// di-assign round-robin ke agent campaign.
func (s *store) getOrCreateThread(ctx context.Context, orgID, contactID, channel, channelID, campaignID string) (convInfo, error) {
	var ci convInfo
	// 1) Reuse an open thread already tied to THIS campaign.
	err := s.pool.QueryRow(ctx,
		`SELECT id, is_bot_active, ai_agent_id FROM conversations
		  WHERE organization_id=$1 AND contact_id=$2 AND status<>'closed' AND campaign_id=$3
		  ORDER BY last_message_at DESC NULLS LAST LIMIT 1`,
		orgID, contactID, campaignID).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		return ci, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, err
	}
	// 2) Adopt an existing open thread that has NO campaign yet (e.g. a generic
	// opener that arrived before any keyword) instead of splitting it off.
	err = s.pool.QueryRow(ctx,
		`SELECT id, is_bot_active, ai_agent_id FROM conversations
		  WHERE organization_id=$1 AND contact_id=$2 AND status<>'closed' AND campaign_id IS NULL
		  ORDER BY last_message_at DESC NULLS LAST LIMIT 1`,
		orgID, contactID).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err == nil {
		s.routeToCampaign(ctx, campaignID, ci.ID) // tag campaign + round-robin assign
		return ci, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ci, err
	}
	// 3) No reusable thread -> create a fresh one for this campaign.
	err = s.pool.QueryRow(ctx,
		`INSERT INTO conversations (organization_id, contact_id, channel, channel_id, status, is_bot_active, ai_agent_id)
		 VALUES ($1, $2, $3, NULLIF($4,'')::uuid, 'open', true,
		         (SELECT id FROM ai_agents WHERE organization_id = $1 AND is_active ORDER BY created_at LIMIT 1))
		 RETURNING id, is_bot_active, ai_agent_id`,
		orgID, contactID, channel, channelID).Scan(&ci.ID, &ci.IsBotActive, &ci.AIAgentID)
	if err != nil {
		return ci, err
	}
	s.routeToCampaign(ctx, campaignID, ci.ID) // set campaign_id + round-robin assign
	return ci, nil
}

// resolveCampaignByReferral memetakan CTWA ad source_id ke campaign aktif.
func (s *store) resolveCampaignByReferral(ctx context.Context, orgID, referral string) (string, bool) {
	if referral == "" {
		return "", false
	}
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM campaigns
		  WHERE organization_id=$1 AND status='active' AND $2 = ANY(ad_source_ids) LIMIT 1`,
		orgID, referral).Scan(&id)
	return id, err == nil
}

// activeCampaignChoices returns a short, comma-separated sample of keywords from
// active campaigns, to suggest options in the "which car?" prompt. Best-effort:
// returns "" on any error or when no campaigns have keywords.
func (s *store) activeCampaignChoices(ctx context.Context, orgID string) string {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT lower(k) FROM campaigns, unnest(keywords) k
		  WHERE organization_id=$1 AND status='active' AND k <> ''
		  ORDER BY 1 LIMIT 6`, orgID)
	if err != nil {
		return ""
	}
	defer rows.Close()
	var kws []string
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil && k != "" {
			kws = append(kws, k)
		}
	}
	return strings.Join(kws, ", ")
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

// routeToCampaign: set campaign + assign agent berikutnya secara round-robin.
// Counter (rr_cursor, lead_count) hanya naik bila percakapan benar-benar baru
// di-route (UPDATE mengenai 1 baris). Tanpa guard ini, rr_cursor ikut naik walau
// conversation sudah ter-attribute -> agent ke-skip & assignment jadi tak akurat.
func (s *store) routeToCampaign(ctx context.Context, campaignID, convID string) {
	tag, err := s.pool.Exec(ctx,
		`WITH agents AS (SELECT user_id FROM campaign_agents WHERE campaign_id=$1 ORDER BY user_id),
		      pick AS (SELECT user_id FROM agents
		               OFFSET (SELECT rr_cursor % GREATEST((SELECT count(*) FROM agents),1) FROM campaigns WHERE id=$1)
		               LIMIT 1)
		 UPDATE conversations SET campaign_id=$1,
		        assigned_agent_id = COALESCE((SELECT user_id FROM pick), assigned_agent_id),
		        updated_at=now()
		  WHERE id=$2 AND campaign_id IS NULL`,
		campaignID, convID)
	if err != nil || tag.RowsAffected() == 0 {
		return // already attributed or failed -> don't advance the round-robin
	}
	_, _ = s.pool.Exec(ctx, `UPDATE campaigns SET rr_cursor=rr_cursor+1, lead_count=lead_count+1 WHERE id=$1`, campaignID)
}

// enrollSequences mendaftarkan percakapan ke semua sequence aktif yang cocok
// (global atau sesuai campaign percakapan). Idempotent (UNIQUE seq+conv).
// Step pertama dijadwalkan setelah delay-nya.
func (s *store) enrollSequences(ctx context.Context, orgID, convID, contactID string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO sequence_enrollments
		   (organization_id, sequence_id, conversation_id, contact_id, current_step, next_run_at, status)
		 SELECT $1, sq.id, $2, $3, 1, now() + make_interval(mins => st1.delay_minutes), 'active'
		   FROM sequences sq
		   JOIN LATERAL (
		     SELECT delay_minutes FROM sequence_steps WHERE sequence_id = sq.id ORDER BY step_order LIMIT 1
		   ) st1 ON true
		  WHERE sq.organization_id = $1 AND sq.is_active
		    AND (sq.campaign_id IS NULL
		         OR sq.campaign_id = (SELECT campaign_id FROM conversations WHERE id = $2))
		 ON CONFLICT (sequence_id, conversation_id) DO NOTHING`,
		orgID, convID, contactID)
}

// sendTarget mengambil data yang diperlukan untuk mengirim outbound ke WA.
type sendTarget struct {
	OrgID         string
	ContactPhone  string
	PhoneNumberID string
	AccessToken   string
}

func (s *store) sendTarget(ctx context.Context, convID string) (sendTarget, error) {
	var t sendTarget
	err := s.pool.QueryRow(ctx,
		`SELECT cv.organization_id, ct.phone,
		        COALESCE(ch.phone_number_id,''), COALESCE(ch.access_token,'')
		   FROM conversations cv
		   JOIN contacts ct ON ct.id = cv.contact_id
		   LEFT JOIN channels ch ON ch.id = cv.channel_id
		  WHERE cv.id = $1`,
		convID,
	).Scan(&t.OrgID, &t.ContactPhone, &t.PhoneNumberID, &t.AccessToken)
	return t, err
}

// updateMessageStatus updates the status of an outbound message matched by externalID.
func (s *store) updateMessageStatus(ctx context.Context, externalID, status string) (string, error) {
	var convID string
	err := s.pool.QueryRow(ctx,
		`UPDATE messages SET status = $2 WHERE external_id = $1 RETURNING conversation_id::text`,
		externalID, status).Scan(&convID)
	return convID, err
}
