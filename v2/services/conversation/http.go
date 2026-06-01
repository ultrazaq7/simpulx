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
	mux.HandleFunc("POST /conversations/{id}/close", a.handleClose)
	mux.HandleFunc("POST /debug/sweep", a.handleSweep)
	return mux
}

// POST /conversations/{id}/assign  {"agent_id": "..."}  (agent_id opsional -> auto-pick)
func (a *app) handleAssign(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	var body struct {
		AgentID string `json:"agent_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx := r.Context()

	meta, err := a.st.conversationMeta(ctx, convID)
	if err != nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}

	var ag agent
	if body.AgentID != "" {
		ag = agent{ID: body.AgentID}
	} else {
		picked, found, err := a.st.pickAgent(ctx, meta.OrgID, meta.DepartmentID)
		if err != nil || !found {
			http.Error(w, "no agent available", http.StatusConflict)
			return
		}
		ag = picked
	}
	if err := a.assignAndAnnounce(ctx, meta.OrgID, convID, ag, meta.DepartmentID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "assigned", "agent_id": ag.ID})
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
