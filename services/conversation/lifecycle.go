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
