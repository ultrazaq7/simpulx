package main

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/simpulx/v2/libs/go/events"
)

func (a *app) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("POST /conversations/{id}/assign", a.handleAssign)
	mux.HandleFunc("POST /conversations/{id}/snooze", a.handleSnooze)
	mux.HandleFunc("POST /conversations/{id}/close", a.handleClose)
	mux.HandleFunc("POST /debug/sweep", a.handleSweep)
	return mux
}

// POST /conversations/{id}/assign  {"agent_id": "..."}  (agent_id opsional -> auto-pick)
func (a *app) handleAssign(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	var body struct {
		AgentID  string `json:"agent_id"`
		Unassign bool   `json:"unassign"`
		ActorID  string `json:"actor_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx := r.Context()

	meta, err := a.st.conversationMeta(ctx, convID)
	if err != nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}

	// Manager/admin sending the lead back to the unassigned queue.
	if body.Unassign {
		if err := a.st.unassign(ctx, meta.OrgID, convID, body.ActorID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Announce so every connected client updates in real time (an empty
		// agent id signals the lead went back to the unassigned queue); without
		// this the change only surfaced on the next poll (a few seconds later).
		_ = a.bus.Publish(events.SubjectConversationAssigned, meta.OrgID, events.ConversationAssigned{
			ConversationID: convID,
		})
		writeJSON(w, map[string]any{"status": "unassigned"})
		return
	}

	var ag agent
	if body.AgentID != "" {
		// Manual assign must target an active, non-deleted user in this workspace
		// (prevents re-orphaning to a disabled agent or a cross-org id).
		if !a.st.isAssignableAgent(ctx, meta.OrgID, body.AgentID) {
			http.Error(w, "agent is not active in this workspace", http.StatusBadRequest)
			return
		}
		ag = agent{ID: body.AgentID}
	} else {
		picked, found, err := a.st.pickAgent(ctx, meta.OrgID)
		if err != nil || !found {
			http.Error(w, "no agent available", http.StatusConflict)
			return
		}
		ag = picked
	}
	if err := a.assignAndAnnounce(ctx, meta.OrgID, convID, ag); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "assigned", "agent_id": ag.ID})
}

// POST /conversations/{id}/snooze  {"until": "RFC3339", "actor_id": "..."}
func (a *app) handleSnooze(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	var body struct {
		Until   string `json:"until"`
		ActorID string `json:"actor_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Until == "" {
		http.Error(w, "until required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	meta, err := a.st.conversationMeta(ctx, convID)
	if err != nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}
	if err := a.st.snooze(ctx, meta.OrgID, convID, body.ActorID, body.Until); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Broadcast so every connected client (mobile inbox + web dashboard) reflects
	// the snooze in real time instead of waiting for a manual refresh.
	_ = a.bus.Publish(events.SubjectConversationUpdated, meta.OrgID, events.ConversationUpdated{
		ConversationID: convID, Status: "snoozed", SnoozedUntil: body.Until,
	})
	writeJSON(w, map[string]any{"status": "snoozed"})
}

// POST /conversations/{id}/close  {"reason": "resolved"}
func (a *app) handleClose(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Reason == "" {
		body.Reason = "manual"
	}
	ctx := r.Context()

	meta, err := a.st.conversationMeta(ctx, convID)
	if err != nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}
	if err := a.st.closeConversation(ctx, meta.OrgID, convID, body.Reason); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = a.bus.Publish(events.SubjectConversationClosed, meta.OrgID, events.ConversationClosed{
		ConversationID: convID, Reason: body.Reason,
	})
	writeJSON(w, map[string]any{"status": "closed"})
}

// POST /debug/sweep?idle_hours=0  — picu auto-close manual (untuk uji).
func (a *app) handleSweep(w http.ResponseWriter, r *http.Request) {
	idle := a.idleHours
	if v := r.URL.Query().Get("idle_hours"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			idle = n
		}
	}
	n := a.sweepIdle(r.Context(), idle)
	writeJSON(w, map[string]any{"closed": n})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
