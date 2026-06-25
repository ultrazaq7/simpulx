package main

import (
	"context"
	"time"

	"github.com/simpulx/v2/libs/go/events"
)

// runLifecycle menyapu percakapan idle secara periodik dan menutupnya.
func (a *app) runLifecycle(ctx context.Context, interval time.Duration, idleHours int) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			a.sweepIdle(ctx, idleHours)
			a.sendDueDrips(ctx)
		}
	}
}

// runSnoozeSweeper reopens due snoozes on its own fast cadence (snoozes need finer
// granularity than the idle sweep) and runs once on startup so a service restart
// doesn't leave an already-due snooze parked until the next tick.
func (a *app) runSnoozeSweeper(ctx context.Context, interval time.Duration) {
	a.sweepSnoozed(ctx)
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			a.sweepSnoozed(ctx)
		}
	}
}

// sweepIdle menutup semua percakapan yang idle melewati ambang.
func (a *app) sweepIdle(ctx context.Context, idleHours int) int {
	convs, err := a.st.idleConversations(ctx, idleHours)
	if err != nil {
		a.log.Error("sweep query failed", "err", err)
		return 0
	}
	n := 0
	for _, c := range convs {
		if err := a.st.closeConversation(ctx, c.OrgID, c.ID, "auto_idle"); err != nil {
			a.log.Error("auto-close failed", "conv", c.ID, "err", err)
			continue
		}
		_ = a.bus.Publish(events.SubjectConversationClosed, c.OrgID, events.ConversationClosed{
			ConversationID: c.ID,
			Reason:         "auto_idle",
		})
		n++
	}
	if n > 0 {
		a.log.Info("auto-closed idle conversations", "count", n)
	}
	return n
}

// sweepSnoozed reopens snoozed conversations whose timer elapsed and drops a bell
// notification on the assigned agent so they remember to follow up.
func (a *app) sweepSnoozed(ctx context.Context) {
	due, err := a.st.dueSnoozes(ctx)
	if err != nil {
		a.log.Error("snooze sweep query failed", "err", err)
		return
	}
	for _, d := range due {
		if err := a.st.reopenSnoozed(ctx, d.ConvID); err != nil {
			a.log.Error("snooze reopen failed", "conv", d.ConvID, "err", err)
			continue
		}
		// Reflect the reopen on every connected client in real time.
		_ = a.bus.Publish(events.SubjectConversationUpdated, d.OrgID, events.ConversationUpdated{
			ConversationID: d.ConvID, Status: "open",
		})
		if d.AgentID != nil && *d.AgentID != "" {
			a.st.addNotification(ctx, d.OrgID, *d.AgentID, "snooze_due",
				"Snooze ended", "Follow up with "+d.Contact, d.ConvID)
			// Push to the agent's browser (FCM) via the gateway.
			_ = a.bus.Publish(events.SubjectNotificationCreated, d.OrgID, events.NotificationCreated{
				UserID: *d.AgentID, Title: "Snooze ended", Body: "Follow up with " + d.Contact, ConversationID: d.ConvID,
			})
		}
		// Relayed to the org's websockets so the agent's bell refreshes instantly.
		_ = a.bus.Publish(events.SubjectAuditCreated, d.OrgID, events.AuditCreated{
			ConversationID: d.ConvID, Type: "snooze_due", ActorType: "system",
		})
	}
	if len(due) > 0 {
		a.log.Info("reopened snoozed conversations", "count", len(due))
	}
}
