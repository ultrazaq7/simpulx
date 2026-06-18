// gateway: gerbang masuk publik. Menerima webhook WhatsApp, meng-ACK cepat
// (<2 dtk) lalu mem-publish event message.received ke NATS. Tidak melakukan
// pekerjaan berat secara sinkron — itu tugas service downstream.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/redis/go-redis/v9"

	"github.com/simpulx/v2/db/migrations"
	"github.com/simpulx/v2/libs/go/broker"
	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/db"
	"github.com/simpulx/v2/libs/go/events"
	logx "github.com/simpulx/v2/libs/go/log"
)

type server struct {
	pool            *pgxpool.Pool
	bus             *broker.Broker
	rdb             *redis.Client
	verifyToken     string
	appSecret       string // META_APP_SECRET for webhook signature verification
	jwtSecret       string
	jwtTTL          time.Duration
	refreshTTL      time.Duration
	conversationURL string
	knowledgeURL    string
	aiAgentURL      string
	httpClient      *http.Client
	storage         *storage
	log             interface {
		Info(string, ...any)
		Error(string, ...any)
		Warn(string, ...any)
	}
}

func main() {
	log := logx.New("gateway")
	ctx := context.Background()

	pool, err := db.Connect(ctx, config.Get("DATABASE_URL", ""))
	if err != nil {
		log.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// ── Automated DB Migrations (Goose) ──
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Error("goose dialect failed", "err", err)
	}
	// Extract standard sql.DB from the same URL (goose needs database/sql)
	stdDB, err := sql.Open("pgx", config.Get("DATABASE_URL", ""))
	if err == nil {
		if err := goose.Up(stdDB, "."); err != nil {
			log.Error("goose migrations failed", "err", err)
			os.Exit(1)
		}
		stdDB.Close()
		log.Info("goose migrations applied successfully")
	} else {
		log.Error("sql open failed for migrations", "err", err)
		os.Exit(1)
	}

	bus, err := broker.Connect(config.Get("NATS_URL", "nats://nats:4222"))
	if err != nil {
		log.Error("nats connect failed", "err", err)
		os.Exit(1)
	}
	defer bus.Close()

	redisOpt, err := redis.ParseURL(config.Get("REDIS_URL", "redis://redis:6379"))
	if err != nil {
		redisOpt = &redis.Options{Addr: "redis:6379"}
	}
	rdb := redis.NewClient(redisOpt)
	defer rdb.Close()

	s := &server{
		pool:            pool,
		bus:             bus,
		rdb:             rdb,
		verifyToken:     config.Get("META_VERIFY_TOKEN", "dev_verify_token"),
		appSecret:       config.Get("META_APP_SECRET", ""),
		jwtSecret:       config.Get("JWT_SECRET", "dev_change_me_in_prod"),
		jwtTTL:          time.Duration(config.GetInt("JWT_ACCESS_TTL", 900)) * time.Second,
		refreshTTL:      time.Duration(config.GetInt("REFRESH_TTL", 2592000)) * time.Second, // 30d
		conversationURL: config.Get("CONVERSATION_URL", "http://conversation:8083"),
		knowledgeURL:    config.Get("KNOWLEDGE_URL", "http://knowledge:8001"),
		aiAgentURL:      config.Get("AI_AGENT_URL", "http://ai-agent:8000"),
		httpClient:      &http.Client{Timeout: 30 * time.Second},
		log:             log,
	}

	// DEV: set password demo untuk user placeholder agar dashboard bisa login.
	s.bootstrapDemoPassword(ctx, config.Get("BOOTSTRAP_DEMO_PASSWORD", ""))

	// Object storage for media uploads (optional - skip if unreachable).
	if st, err := newStorage(
		config.Get("S3_ENDPOINT", "http://minio:9000"),
		config.Get("S3_ACCESS_KEY", "simpulx"),
		config.Get("S3_SECRET_KEY", "simpulx_secret"),
		config.Get("S3_BUCKET", "simpulx-media"),
		config.Get("MEDIA_PUBLIC_BASE", "http://localhost:9010/simpulx-media"),
	); err != nil {
		log.Warn("storage init failed; uploads disabled", "err", err)
	} else if err := st.ensureBucket(ctx); err != nil {
		log.Warn("storage bucket setup failed; uploads disabled", "err", err)
	} else {
		s.storage = st
		log.Info("media storage ready")
	}

	mux := http.NewServeMux()

	// ── Rate Limiters ──
	authRL := rateLimit(5, 10)    // 5 req/sec per IP, burst 10 (anti brute-force)
	webhookRL := rateLimit(100, 200) // 100 req/sec per IP, burst 200 (Meta can burst)
	leadsRL := rateLimit(10, 20)  // 10 req/sec per IP, burst 20

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/webhook/whatsapp", webhookRL(s.verifyWebhookSignature(s.handleWhatsApp)))
	mux.HandleFunc("/webhook/meta", webhookRL(s.verifyWebhookSignature(s.handleMeta)))

	// Proxy media to MinIO so Meta can download it via the Gateway's public URL
	mux.HandleFunc("/simpulx-media/", func(w http.ResponseWriter, r *http.Request) {
		target, _ := url.Parse(config.Get("S3_ENDPOINT", "http://minio:9000"))
		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.ServeHTTP(w, r)
	})

	// ── Auth ──
	mux.HandleFunc("POST /auth/login", authRL(s.handleLogin))
	mux.HandleFunc("POST /auth/forgot-password", authRL(s.handleForgotPassword))
	mux.HandleFunc("POST /auth/reset-password", authRL(s.handleResetPassword))
	mux.HandleFunc("POST /auth/refresh", authRL(s.handleRefresh))
	mux.HandleFunc("POST /auth/logout", authRL(s.handleLogout))

	// ── Public Web API lead ingest (API-key auth, no JWT) ──
	mux.HandleFunc("POST /v1/leads", leadsRL(s.handleIngestLead))

	// ── Dashboard API (semua butuh JWT, scoped per org) ──
	mux.HandleFunc("GET /api/me", s.requireAuth(s.handleMe))
	mux.HandleFunc("GET /api/conversations", s.requireAuth(s.handleListConversations))
	mux.HandleFunc("GET /api/conversations/{id}/messages", s.requireAuth(s.handleGetMessages))
	mux.HandleFunc("GET /api/conversations/{id}/messages/search", s.requireAuth(s.handleSearchMessages))
	mux.HandleFunc("PATCH /api/conversations/{id}", s.requireAuth(s.handlePatchConversation))
	mux.HandleFunc("POST /api/conversations/{id}/calls", s.requireAuth(s.handleTrackCall))
	mux.HandleFunc("POST /api/calls/request-permission", s.requireAuth(s.handleRequestCallPermission))
	mux.HandleFunc("POST /api/calls/initiate", s.requireAuth(s.handleInitiateCall))
	mux.HandleFunc("POST /api/calls/{id}/end", s.requireAuth(s.handleEndCall))
	mux.HandleFunc("GET /api/calls/{id}", s.requireAuth(s.handleGetCall))
	mux.HandleFunc("POST /api/conversations/{id}/summary", s.requireAuth(s.handleSummaryStream))
	mux.HandleFunc("GET /api/stages", s.requireAuth(s.handleListStages))
	mux.HandleFunc("GET /api/dispositions", s.requireAuth(s.handleListDispositions))
	mux.HandleFunc("POST /api/conversations/{id}/messages", s.requireAuth(s.handleSendMessage))
	
	mux.HandleFunc("GET /api/export/campaigns", s.requireAuth(s.handleExportCampaigns))
	mux.HandleFunc("GET /api/export/chats", s.requireAuth(s.handleExportChats))
	mux.HandleFunc("POST /api/conversations/{id}/assign", s.requireAuth(s.handleAssign))
	mux.HandleFunc("POST /api/conversations/{id}/close", s.requireAuth(s.handleClose))
	mux.HandleFunc("POST /api/conversations/{id}/bot", s.requireAuth(s.handleToggleBot))
	mux.HandleFunc("GET /api/agents", s.requireAuth(s.handleListAgents))
	mux.HandleFunc("GET /api/knowledge", s.requireAuth(s.handleListKnowledge))
	mux.HandleFunc("POST /api/knowledge", s.requireAuth(s.handleAddKnowledge))
	mux.HandleFunc("GET /api/ai-agent", s.requireAuth(s.handleGetAIAgent))
	mux.HandleFunc("PUT /api/ai-agent", s.requireAuth(s.handleUpdateAIAgent))
	mux.HandleFunc("GET /api/llm-models", s.requireAuth(s.handleListLLMModels))
	mux.HandleFunc("GET /api/stats", s.requireAuth(s.handleStats))
	mux.HandleFunc("GET /api/dashboard/cards", s.requireAuth(s.handleDashboardCards))
	mux.HandleFunc("GET /api/analytics", s.requireAuth(s.handleAnalytics))
	mux.HandleFunc("GET /api/broadcasts", s.requireAuth(s.gate("view_broadcasts", s.handleListBroadcasts)))
	mux.HandleFunc("POST /api/broadcasts", s.requireAuth(s.gate("send_broadcasts", s.handleCreateBroadcast)))
	mux.HandleFunc("POST /api/broadcasts/test-send", s.requireAuth(s.gate("send_broadcasts", s.handleTestSendBroadcast)))
	mux.HandleFunc("GET /api/broadcasts/{id}", s.requireAuth(s.gate("view_broadcasts", s.handleGetBroadcast)))
	mux.HandleFunc("GET /api/broadcasts/{id}/recipients", s.requireAuth(s.gate("view_broadcasts", s.handleListBroadcastRecipients)))
	mux.HandleFunc("POST /api/broadcasts/{id}/send", s.requireAuth(s.gate("send_broadcasts", s.handleSendBroadcast)))
	mux.HandleFunc("POST /api/broadcasts/{id}/retry", s.requireAuth(s.gate("send_broadcasts", s.handleRetryBroadcast)))
	mux.HandleFunc("DELETE /api/broadcasts/{id}", s.requireAuth(s.gate("send_broadcasts", s.handleDeleteBroadcast)))
	mux.HandleFunc("GET /api/quick-replies", s.requireAuth(s.handleListQuickReplies))
	mux.HandleFunc("POST /api/quick-replies", s.requireAuth(s.gate("manage_quick_replies", s.handleCreateQuickReply)))
	mux.HandleFunc("DELETE /api/quick-replies/{id}", s.requireAuth(s.gate("manage_quick_replies", s.handleDeleteQuickReply)))
	mux.HandleFunc("GET /api/conversations/{id}/notes", s.requireAuth(s.handleListNotes))
	mux.HandleFunc("POST /api/conversations/{id}/notes", s.requireAuth(s.handleAddNote))
	mux.HandleFunc("GET /api/contacts", s.requireAuth(s.gate("view_contacts", s.handleListContacts)))
	mux.HandleFunc("POST /api/contacts", s.requireAuth(s.gate("create_contacts", s.handleCreateContact)))
	mux.HandleFunc("PATCH /api/contacts/{id}", s.requireAuth(s.gate("edit_contacts", s.handleUpdateContact)))
	mux.HandleFunc("GET /api/channels", s.requireAuth(s.handleListChannels))
	mux.HandleFunc("POST /api/channels", s.requireAuth(s.gate("manage_channels", s.handleCreateChannel)))
	mux.HandleFunc("PATCH /api/channels/{id}", s.requireAuth(s.gate("manage_channels", s.handlePatchChannel)))
	mux.HandleFunc("DELETE /api/channels/{id}", s.requireAuth(s.gate("manage_channels", s.handleDeleteChannel)))
	mux.HandleFunc("POST /api/channels/{id}/test", s.requireAuth(s.gate("manage_channels", s.handleTestChannel)))
	mux.HandleFunc("GET /api/automations", s.requireAuth(s.gate("view_automation", s.handleListAutomations)))
	mux.HandleFunc("POST /api/automations", s.requireAuth(s.gate("manage_automation", s.handleCreateAutomation)))
	mux.HandleFunc("GET /api/automations/{id}", s.requireAuth(s.gate("view_automation", s.handleGetAutomation)))
	mux.HandleFunc("PATCH /api/automations/{id}", s.requireAuth(s.gate("manage_automation", s.handleUpdateAutomation)))
	mux.HandleFunc("DELETE /api/automations/{id}", s.requireAuth(s.gate("manage_automation", s.handleDeleteAutomation)))
	mux.HandleFunc("GET /api/templates", s.requireAuth(s.handleListTemplates))
	mux.HandleFunc("POST /api/templates", s.requireAuth(s.handleCreateTemplate))
	mux.HandleFunc("PATCH /api/templates/{id}", s.requireAuth(s.handleUpdateTemplate))
	mux.HandleFunc("DELETE /api/templates/{id}", s.requireAuth(s.handleDeleteTemplate))
	mux.HandleFunc("POST /api/templates/{id}/submit", s.requireAuth(s.handleSubmitTemplate))
	mux.HandleFunc("GET /api/users", s.requireAuth(s.handleListUsers))
	mux.HandleFunc("POST /api/users", s.requireAuth(s.gate("manage_team", s.handleCreateUser)))
	mux.HandleFunc("PATCH /api/users/me/presence", s.requireAuth(s.handleSetPresence))
	mux.HandleFunc("GET /api/users/{id}/activity", s.requireAuth(s.handleUserActivity))
	mux.HandleFunc("PATCH /api/users/{id}", s.requireAuth(s.gate("manage_team", s.handleUpdateUser)))
	mux.HandleFunc("DELETE /api/users/{id}", s.requireAuth(s.gate("manage_team", s.handleDeleteUser)))
	mux.HandleFunc("POST /api/users/fcm-token", s.requireAuth(s.handleRegisterFCMToken))
	mux.HandleFunc("GET /api/role-permissions", s.requireAuth(s.handleGetRolePermissions))
	mux.HandleFunc("PUT /api/role-permissions", s.requireAuth(s.handleUpdateRolePermissions))
	mux.HandleFunc("GET /api/departments", s.requireAuth(s.handleListDepartments))
	mux.HandleFunc("POST /api/departments", s.requireAuth(s.gate("manage_departments", s.handleCreateDepartment)))
	mux.HandleFunc("PATCH /api/departments/{id}", s.requireAuth(s.gate("manage_departments", s.handleUpdateDepartment)))
	mux.HandleFunc("DELETE /api/departments/{id}", s.requireAuth(s.gate("manage_departments", s.handleDeleteDepartment)))
	mux.HandleFunc("GET /api/audit-log", s.requireAuth(s.handleListAuditLog))
	mux.HandleFunc("GET /api/organization", s.requireAuth(s.handleGetOrganization))
	mux.HandleFunc("PATCH /api/organization", s.requireAuth(s.handleUpdateOrganization))
	mux.HandleFunc("GET /api/web-api-sources", s.requireAuth(s.handleListWebAPISources))
	mux.HandleFunc("POST /api/web-api-sources", s.requireAuth(s.handleCreateWebAPISource))
	mux.HandleFunc("PATCH /api/web-api-sources/{id}", s.requireAuth(s.handleUpdateWebAPISource))
	mux.HandleFunc("POST /api/web-api-sources/{id}/regenerate-key", s.requireAuth(s.handleRegenerateWebAPIKey))
	mux.HandleFunc("DELETE /api/web-api-sources/{id}", s.requireAuth(s.handleDeleteWebAPISource))
	mux.HandleFunc("GET /api/analytics/campaigns", s.requireAuth(s.handleCampaignAnalytics))
	mux.HandleFunc("GET /api/campaigns", s.requireAuth(s.handleListCampaigns))
	mux.HandleFunc("POST /api/campaigns", s.requireAuth(s.gate("manage_campaigns", s.handleCreateCampaign)))
	mux.HandleFunc("GET /api/campaigns/{id}", s.requireAuth(s.handleGetCampaign))
	mux.HandleFunc("PATCH /api/campaigns/{id}", s.requireAuth(s.gate("manage_campaigns", s.handleUpdateCampaign)))
	mux.HandleFunc("DELETE /api/campaigns/{id}", s.requireAuth(s.gate("manage_campaigns", s.handleDeleteCampaign)))
	mux.HandleFunc("GET /api/sequences", s.requireAuth(s.handleListSequences))
	mux.HandleFunc("POST /api/sequences", s.requireAuth(s.handleCreateSequence))
	mux.HandleFunc("GET /api/sequences/{id}", s.requireAuth(s.handleGetSequence))
	mux.HandleFunc("PATCH /api/sequences/{id}", s.requireAuth(s.handleUpdateSequence))
	mux.HandleFunc("DELETE /api/sequences/{id}", s.requireAuth(s.handleDeleteSequence))
	mux.HandleFunc("POST /api/uploads", s.requireAuth(s.handleUpload))

	// Proxy media directly to minio
	mux.HandleFunc("GET /simpulx-media/", func(w http.ResponseWriter, r *http.Request) {
		target, _ := url.Parse(config.Get("S3_ENDPOINT", "http://minio:9000"))
		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.ServeHTTP(w, r)
	})


	port := config.Get("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      cors(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("gateway listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server error", "err", err)
			os.Exit(1)
		}
	}()

	// start background jobs

	s.initFCMPush(ctx)

	// graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutCtx)
	log.Info("gateway stopped")
}

// verifyWebhookSignature validates the Meta X-Hub-Signature-256 header using
// HMAC-SHA256 of the raw request body. If META_APP_SECRET is empty (dev), the
// check is skipped. GET requests (verification challenge) are always passed through.
func (s *server) verifyWebhookSignature(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// GET requests are webhook verification challenges — no signature needed
		if r.Method == http.MethodGet || s.appSecret == "" {
			next(w, r)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body)) // replace for downstream

		sig := r.Header.Get("X-Hub-Signature-256")
		if !strings.HasPrefix(sig, "sha256=") {
			s.log.Warn("webhook missing X-Hub-Signature-256 header")
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		expected := sig[7:] // strip "sha256=" prefix
		mac := hmac.New(sha256.New, []byte(s.appSecret))
		mac.Write(body)
		actual := hex.EncodeToString(mac.Sum(nil))

		if !hmac.Equal([]byte(expected), []byte(actual)) {
			s.log.Warn("webhook signature mismatch")
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

func (s *server) handleWhatsApp(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Verifikasi webhook Meta
		q := r.URL.Query()
		if q.Get("hub.mode") == "subscribe" && q.Get("hub.verify_token") == s.verifyToken {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(q.Get("hub.challenge")))
			return
		}
		http.Error(w, "forbidden", http.StatusForbidden)
	case http.MethodPost:
		// ACK cepat: baca body, proses, balas 200. (Pemrosesan ringan,
		// hanya publish ke NATS — tetap di bawah batas waktu Meta.)
		var payload waWebhook
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			s.log.Warn("bad webhook payload", "err", err)
			w.WriteHeader(http.StatusOK) // tetap 200 agar Meta tidak retry payload rusak
			return
		}
		s.ingest(r.Context(), payload)
		w.WriteHeader(http.StatusOK)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ingest menelusuri payload, resolve org dari phone_number_id, dan publish
// satu event message.received per pesan masuk.
func (s *server) ingest(ctx context.Context, p waWebhook) {
	for _, entry := range p.Entry {
		for _, change := range entry.Changes {
			val := change.Value
			if len(val.Statuses) > 0 {
				orgID, err := s.resolveOrg(ctx, val.Metadata.PhoneNumberID)
				if err != nil {
					s.log.Warn("unknown phone_number_id for status", "pnid", val.Metadata.PhoneNumberID, "err", err)
				} else {
					for _, st := range val.Statuses {
						evt := events.MessageStatusUpdated{
							ExternalID: st.ID,
							Status:     st.Status,
							Timestamp:  st.Timestamp,
						}
						if err := s.bus.Publish(events.SubjectMessageStatusUpdated, orgID, evt); err != nil {
							s.log.Error("publish status failed", "err", err)
							continue
						}
						s.log.Info("meta message.status.updated published", "org", orgID, "status", st.Status)
					}
				}
			}

			// ── Call events (WhatsApp Business Calling API) ──
			if change.Field == "calls" {
				orgID, err := s.resolveOrg(ctx, val.Metadata.PhoneNumberID)
				if err != nil {
					s.log.Warn("unknown phone_number_id for call event", "pnid", val.Metadata.PhoneNumberID, "err", err)
				} else {
					// Re-marshal the value to pass the raw calls array
					if raw, err := json.Marshal(val.Messages); err == nil && len(val.Messages) == 0 {
						// Calls come in the value object itself, re-encode the whole value
						if rawVal, err2 := json.Marshal(change.Value); err2 == nil {
							var callVal struct {
								Calls json.RawMessage `json:"calls"`
							}
							if json.Unmarshal(rawVal, &callVal) == nil && len(callVal.Calls) > 0 {
								s.processCallWebhook(ctx, orgID, callVal.Calls)
							}
						}
					} else {
						_ = raw // suppress unused
					}
				}
				continue
			}

			if len(val.Messages) == 0 {
				continue // status update / lainnya sudah di-handle di atas
			}
			orgID, err := s.resolveOrg(ctx, val.Metadata.PhoneNumberID)
			if err != nil {
				s.log.Warn("unknown phone_number_id", "pnid", val.Metadata.PhoneNumberID, "err", err)
				continue
			}
			contactName := ""
			if len(val.Contacts) > 0 {
				contactName = val.Contacts[0].Profile.Name
			}
			for _, m := range val.Messages {
				// Redis Debounce: SETNX webhook:debounce:<wamid>
				key := "webhook:debounce:" + m.ID
				ok, err := s.rdb.SetNX(ctx, key, "1", 10*time.Second).Result()
				if err != nil {
					s.log.Error("redis debounce error", "err", err)
				} else if !ok {
					s.log.Warn("duplicate webhook dropped", "wamid", m.ID)
					continue
				}

				// JSON asli pesan apa adanya (tidak lossy) — penting untuk
				// inspeksi pesan "unsupported" yang field-nya di luar struct.
				raw := m.rawJSON()
				if m.Type == "unsupported" {
					s.log.Warn("unsupported inbound message captured",
						"from", m.From, "wamid", m.ID, "reason", m.errorSummary(), "raw", string(raw))
				}
				// Real Meta media arrives as an id (no link) — download + re-host.
				mediaURL := m.extractMediaURL()
				if mediaURL == "" {
					if mid := m.mediaID(); mid != "" && s.storage != nil && !config.GetBool("WA_MOCK", true) {
						if token := s.channelToken(ctx, val.Metadata.PhoneNumberID); token != "" {
							if u, derr := s.downloadMetaMedia(ctx, token, mid); derr == nil {
								mediaURL = u
							} else {
								s.log.Warn("inbound media download failed", "media_id", mid, "err", derr)
							}
						}
					}
				}
				evt := events.MessageReceived{
					Channel:       "whatsapp",
					PhoneNumberID: val.Metadata.PhoneNumberID,
					From:          m.From,
					ContactName:   contactName,
					Referral:      m.referralSourceID(),
					Message: events.InboundMessage{
						ExternalID:    m.ID,
						Type:          m.Type,
						Text:          m.extractText(),
						MediaURL:      mediaURL,
						ButtonPayload: m.buttonPayload(),
					},
					Raw: raw,
				}
				if err := s.bus.Publish(events.SubjectMessageReceived, orgID, evt); err != nil {
					s.log.Error("publish failed", "err", err)
					continue
				}
				s.log.Info("message.received published", "org", orgID, "from", m.From, "wamid", m.ID)
			}
		}
	}
}

// resolveOrg mencari organization_id dari channel berdasarkan phone_number_id.
func (s *server) resolveOrg(ctx context.Context, phoneNumberID string) (string, error) {
	var orgID string
	err := s.pool.QueryRow(ctx,
		`SELECT organization_id FROM channels WHERE phone_number_id = $1 AND is_active LIMIT 1`,
		phoneNumberID,
	).Scan(&orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errors.New("no channel for phone_number_id")
	}
	return orgID, err
}
