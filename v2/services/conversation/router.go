package main

import (
	"context"
	"encoding/json"

	"github.com/simpulx/v2/libs/go/events"
)

// onHandoff: saat AI mengalihkan ke manusia, assign agen via round-robin.
func (a *app) onHandoff(env events.Envelope) error {
	var e events.ConversationHandoff
	if err := json.Unmarshal(env.Data, &e); err != nil {
		a.log.Warn("decode handoff", "err", err)
		return nil
	}
	ctx := context.Background()

	meta, err := a.st.conversationMeta(ctx, e.ConversationID)
	if err != nil {
		return err
	}
	if meta.AssignedTo != nil && *meta.AssignedTo != "" {
		return nil // sudah ada agen, jangan re-assign
	}

	ag, found, err := a.st.pickAgent(ctx, env.OrgID, meta.DepartmentID)
	if err != nil {
		return err
	}
	if !found {
		// Tidak ada agen tersedia: biarkan tetap pending (masuk antrian).
		a.log.Warn("no agent available, queued", "conv", e.ConversationID)
		return nil
	}

	if err := a.assignAndAnnounce(ctx, env.OrgID, e.ConversationID, ag, meta.DepartmentID); err != nil {
		return err
	}
	a.log.Info("conversation assigned", "conv", e.ConversationID, "agent", ag.Name, "reason", e.Reason)
	return nil
}

// assignAndAnnounce melakukan assign + publish event conversation.assigned.
func (a *app) assignAndAnnounce(ctx context.Context, orgID, convID string, ag agent, departmentID *string) error {
	if err := a.st.assign(ctx, orgID, convID, ag.ID); err != nil {
		return err
	}
	deptID := ""
	if departmentID != nil {
		deptID = *departmentID
	}
	return a.bus.Publish(events.SubjectConversationAssigned, orgID, events.ConversationAssigned{
		ConversationID: convID,
		AgentID:        ag.ID,
		AgentName:      ag.Name,
		DepartmentID:   deptID,
	})
}
