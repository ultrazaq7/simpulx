package main

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Guard-coverage test.
//
// The point of this file is NOT to re-check the guards that exist today: it is to
// make a MISSING guard fail the build. Every audit of this codebase so far found
// endpoints that were simply never gated (System Logs read every campaign's
// messages; the web-api-source mutations were open to any logged-in user; the
// call endpoints accepted any call id in the org). Each was added in good faith
// and nothing complained, because nothing was watching.
//
// So this test reads main.go, enumerates every mutating route, and requires each
// one to carry a guard or be listed below with a reason. Adding a route without
// one fails here, at review time, instead of in an audit months later.

var routeRe = regexp.MustCompile(`mux\.HandleFunc\("([A-Z]+) (/[^"]*)",\s*(.*?)\)\n`)

// allowlist: routes that legitimately carry no permission gate and no ownership
// scope. Every entry needs a reason, because "it looked fine" is how the holes
// above got in.
var unguardedByDesign = map[string]string{
	// Pre-auth or public by definition.
	"POST /auth/login":                     "pre-auth",
	"POST /auth/forgot-password":           "pre-auth",
	"POST /auth/reset-password":            "pre-auth (single-use token)",
	"POST /auth/verify-email":              "pre-auth (token)",
	"POST /auth/refresh":                   "pre-auth (refresh token)",
	"POST /auth/logout":                    "session teardown",
	"POST /v1/leads":                       "public ingest, authenticated by web-api key",
	"POST /api/public/account-deletion":    "public form, no session",
	"POST /api/public/register":            "public lead form; creates only a pending row a human approves",
	"POST /api/public/register/{id}/proof": "public: attaches a receipt to own pending request only, size/type bounded",

	// Self-service: the caller acts on their own account only.
	"POST /api/account/password":           "self",
	"POST /api/account/email":              "self",
	"PATCH /api/users/me/presence":         "self",
	"POST /api/users/fcm-token":            "self (own device)",
	"DELETE /api/users/fcm-token":          "self (own device)",
	"POST /api/notifications/read":         "self",
	"PATCH /api/subscription":              "org-level; owner/admin only in UI, revisit with P6 billing",
	"POST /api/uploads":                    "any agent must attach media to reply; scoped by org + storage key",
	"PUT /api/role-permissions":            "checks hasPerm(manage_roles) inline",
	"POST /api/conversations/{id}/summary": "conversation-scoped inside handler",
}

// hasGuard reports whether the handler expression carries one of the guard
// wrappers. Handlers that guard INSIDE their body are covered by the body scan.
func hasGuard(expr string) bool {
	for _, w := range []string{
		"s.gate(", "s.campaignScoped(", "s.branchScoped(", "s.callScoped(",
		"s.requireSuperAdmin(",
	} {
		if strings.Contains(expr, w) {
			return true
		}
	}
	return false
}

func TestEveryMutatingRouteIsGuarded(t *testing.T) {
	main, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	// Handler bodies, so an inline guard (guardConversation / canAccessConversation
	// / hasPerm) counts as a guard too.
	bodies := map[string]string{}
	entries, _ := os.ReadDir(".")
	fnRe := regexp.MustCompile(`func \(s \*server\) (handle\w+)\(`)
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".go") || strings.HasSuffix(e.Name(), "_test.go") {
			continue
		}
		b, err := os.ReadFile(e.Name())
		if err != nil {
			continue
		}
		src := string(b)
		locs := fnRe.FindAllStringSubmatchIndex(src, -1)
		for i, loc := range locs {
			name := src[loc[2]:loc[3]]
			end := len(src)
			if i+1 < len(locs) {
				end = locs[i+1][0]
			}
			bodies[name] = src[loc[1]:end]
		}
	}
	inlineGuard := regexp.MustCompile(`guardConversation|canAccessConversation|canAccessCampaign|hasPerm\(|requireSuperAdmin`)
	handlerRe := regexp.MustCompile(`(handle\w+)`)

	var missing []string
	for _, m := range routeRe.FindAllStringSubmatch(string(main), -1) {
		method, path, expr := m[1], m[2], m[3]
		switch method {
		case "POST", "PATCH", "PUT", "DELETE":
		default:
			continue
		}
		key := method + " " + path
		if strings.HasPrefix(path, "/webhook") {
			continue // signature-verified, unauthenticated by design
		}
		if _, ok := unguardedByDesign[key]; ok {
			continue
		}
		if hasGuard(expr) {
			continue
		}
		if hn := handlerRe.FindString(expr); hn != "" && inlineGuard.MatchString(bodies[hn]) {
			continue
		}
		missing = append(missing, key)
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("%d mutating route(s) carry no permission gate and no ownership scope.\n"+
			"Add s.gate(...) / a *Scoped wrapper / an inline guard, or add an entry with a\n"+
			"reason to unguardedByDesign:\n  %s",
			len(missing), strings.Join(missing, "\n  "))
	}
}

// The three defaults tables (backend defaultPerm, web/lib/permissions.ts
// defaultFor, and the roles page) were documented as "keep in sync" and did not
// stay in sync. The roles page now imports the shared one, so only two remain:
// this pins the backend half so a change there is a deliberate edit here too.
func TestManagerDefaultsAreExplicit(t *testing.T) {
	denied := []string{"manage_roles", "manage_channels", "manage_ai", "manage_organization"}
	for _, k := range denied {
		if defaultPerm("manager", k) {
			t.Errorf("manager should NOT hold %q by default", k)
		}
	}
	for _, k := range []string{"manage_campaigns", "manage_templates", "view_contacts", "send_broadcasts"} {
		if !defaultPerm("manager", k) {
			t.Errorf("manager should hold %q by default", k)
		}
	}
	// An unknown custom role must default closed, never open.
	if defaultPerm("some_custom_role", "manage_campaigns") {
		t.Error("unknown role must default to DENY")
	}
	// owner/admin are always full access.
	for _, r := range []string{"owner", "admin"} {
		if !defaultPerm(r, "manage_roles") {
			t.Errorf("%s must be full access", r)
		}
	}
}
