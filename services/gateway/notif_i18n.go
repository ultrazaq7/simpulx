package main

import (
	"context"
	"strings"

	"firebase.google.com/go/v4/messaging"
)

// apnsAlert builds the iOS-only APNS payload that makes iOS display a
// notification natively (like Android's native renderer), so the Flutter client
// never draws a duplicate. `mutable-content` lets a future Notification Service
// Extension enrich it (avatar/sender) without another server change. Android and
// web ignore this block entirely.
// `category` maps to aps.category so iOS shows that category's actions on
// long-press (e.g. the "message" category's inline Reply). Empty = no actions.
// unreadBadgeFor counts the chats waiting on this user — the same thing Android's
// launcher badge reflects (one notification per unread conversation), so iOS shows
// a matching number. Scoped to conversations ASSIGNED to them: admins/managers
// don't get a badge for leads that aren't theirs. Returns -1 on error so the push
// simply goes out without a badge rather than clobbering the icon with 0.
func (s *server) unreadBadgeFor(ctx context.Context, userID string) int {
	if userID == "" {
		return -1
	}
	var n int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM conversations
		  WHERE assigned_agent_id = $1::uuid
		    AND COALESCE(unread_count, 0) > 0
		    AND status <> 'closed'`, userID).Scan(&n); err != nil {
		s.log.Warn("unread badge count failed", "err", err, "user", userID)
		return -1
	}
	return n
}

// apnsAlert builds the iOS payload. badge is the recipient's unread-chat count:
// iOS can NOT compute an icon badge itself (Android does), so if the server never
// sends one the app icon simply never shows a number. Pass -1 to omit it.
func apnsAlert(title, body, category string, badge int) *messaging.APNSConfig {
	aps := &messaging.Aps{
		Alert:          &messaging.ApsAlert{Title: title, Body: body},
		Sound:          "default",
		MutableContent: true,
		Category:       category,
	}
	if badge >= 0 {
		aps.Badge = &badge
	}
	return &messaging.APNSConfig{
		Headers: map[string]string{"apns-priority": "10"},
		Payload: &messaging.APNSPayload{Aps: aps},
	}
}

// localizeNotif translates a bell/push notification's already-rendered ENGLISH
// title/body into `locale`, keyed on its stable `type`. The backend stores and
// emits English (it has no i18n); this is the SINGLE point that localizes the
// FCM data payload, so both Android (native Kotlin) and iOS (Dart) display the
// user's language with zero client-side i18n. The web bell localizes separately
// on the client so it follows each viewer's live language toggle.
//
// Dynamic values (contact name, form name) are extracted from the stable English
// source string and carried through. Contact-name titles are never translated.
// Unknown types or non-Indonesian locales pass through unchanged.
func localizeNotif(notifType, title, body, locale string) (string, string) {
	if !strings.HasPrefix(strings.ToLower(locale), "id") {
		return title, body
	}
	switch notifType {
	case "ai_handoff":
		// Lead-temperature words (cold/warm/hot) are product terms — never translate.
		return "Prospek siap untuk Anda",
			"Asisten AI sudah mengumpulkan detailnya - prospek ini sudah warm dan siap ditangani."
	case "snooze_due":
		name := strings.TrimPrefix(body, "Follow up with ")
		return "Penundaan berakhir", "Tindak lanjuti dengan " + name
	case "snooze_reminder":
		// title is the contact name (kept). body is either the per-contact
		// pre-expiry line or the generic "get ready" push line.
		if strings.HasPrefix(body, "Snooze for ") && strings.HasSuffix(body, " is ending soon") {
			name := strings.TrimSuffix(strings.TrimPrefix(body, "Snooze for "), " is ending soon")
			return title, "Penundaan untuk " + name + " akan segera berakhir"
		}
		if body == "Snooze ending soon. Get ready to follow up." {
			return title, "Penundaan segera berakhir. Bersiap untuk tindak lanjut."
		}
		return title, body
	case "follow_up":
		// title is the contact name (kept).
		switch body {
		case "Lead is waiting for your follow-up":
			return title, "Prospek menunggu tindak lanjut Anda"
		case "Priority lead waiting for your reply. Follow up now.":
			return title, "Prospek prioritas menunggu balasan Anda. Tindak lanjuti sekarang."
		}
		return title, body
	case "form_completed":
		if i := strings.Index(body, " completed "); i >= 0 {
			name := body[:i]
			form := body[i+len(" completed "):]
			return "Detail prospek siap", name + " menyelesaikan " + form
		}
		return "Detail prospek siap", body
	}
	return title, body
}
