package main

// Link preview (Open Graph) fetcher for chat URLs. The browser can't fetch
// arbitrary pages (CORS), so the gateway does it: GET /api/link-preview?url=...
// returns {url,title,description,image,site_name}. Results are cached in-memory
// for 24h. SSRF-hardened: only http/https, and every hop (including redirects)
// must resolve to a public IP.

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

type linkPreview struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
}

type lpEntry struct {
	data linkPreview
	exp  time.Time
}

var (
	lpCache   sync.Map // normalized url -> lpEntry
	lpClient  *http.Client
	lpInitial sync.Once
)

// lpHostAllowed rejects hosts that resolve to loopback/private/link-local
// addresses so the preview fetcher can't be used to probe internal services.
func lpHostAllowed(host string) error {
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return errors.New("unresolvable host")
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
			ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return errors.New("host not allowed")
		}
	}
	return nil
}

func lpHTTPClient() *http.Client {
	lpInitial.Do(func() {
		lpClient = &http.Client{
			Timeout: 6 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return errors.New("too many redirects")
				}
				if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
					return errors.New("bad scheme")
				}
				return lpHostAllowed(req.URL.Hostname())
			},
		}
	})
	return lpClient
}

var (
	// <meta ... property="og:x" ... content="..."> in either attribute order.
	lpMetaRe1 = regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)\s*=\s*["'](og:title|og:description|og:image|og:site_name|twitter:title|twitter:description|twitter:image(?::src)?)["'][^>]*?content\s*=\s*["']([^"']*)["']`)
	lpMetaRe2 = regexp.MustCompile(`(?is)<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]*?(?:property|name)\s*=\s*["'](og:title|og:description|og:image|og:site_name|twitter:title|twitter:description|twitter:image(?::src)?)["']`)
	lpTitleRe = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
)

func fetchLinkPreview(ctx context.Context, raw string) (linkPreview, error) {
	out := linkPreview{URL: raw}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return out, errors.New("invalid url")
	}
	if err := lpHostAllowed(u.Hostname()); err != nil {
		return out, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return out, err
	}
	// A browser-ish UA: many sites only emit OG tags for real browsers.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SimpulxPreview/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	res, err := lpHTTPClient().Do(req)
	if err != nil {
		return out, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 400 {
		return out, fmt.Errorf("status %d", res.StatusCode)
	}
	ct := res.Header.Get("Content-Type")
	if ct != "" && !strings.Contains(ct, "html") {
		return out, errors.New("not html")
	}
	// Read at most 512KB - OG tags live in <head>.
	body, err := io.ReadAll(io.LimitReader(res.Body, 512*1024))
	if err != nil && len(body) == 0 {
		return out, err
	}
	page := string(body)

	set := func(key, val string) {
		val = strings.TrimSpace(html.UnescapeString(val))
		if val == "" {
			return
		}
		switch {
		case key == "og:title" || (strings.HasPrefix(key, "twitter:title") && out.Title == ""):
			if out.Title == "" || key == "og:title" {
				out.Title = val
			}
		case key == "og:description" || (strings.HasPrefix(key, "twitter:description") && out.Description == ""):
			if out.Description == "" || key == "og:description" {
				out.Description = val
			}
		case key == "og:image" || (strings.HasPrefix(key, "twitter:image") && out.Image == ""):
			if out.Image == "" || key == "og:image" {
				out.Image = val
			}
		case key == "og:site_name":
			out.SiteName = val
		}
	}
	for _, m := range lpMetaRe1.FindAllStringSubmatch(page, -1) {
		set(strings.ToLower(m[1]), m[2])
	}
	for _, m := range lpMetaRe2.FindAllStringSubmatch(page, -1) {
		set(strings.ToLower(m[2]), m[1])
	}
	if out.Title == "" {
		if m := lpTitleRe.FindStringSubmatch(page); m != nil {
			out.Title = strings.TrimSpace(html.UnescapeString(m[1]))
		}
	}
	// Resolve a relative og:image against the final URL.
	if out.Image != "" {
		if img, err := url.Parse(out.Image); err == nil {
			base := res.Request.URL
			out.Image = base.ResolveReference(img).String()
		}
	}
	return out, nil
}

// GET /api/link-preview?url=...
func (s *server) handleLinkPreview(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	if raw == "" {
		http.Error(w, "url required", http.StatusBadRequest)
		return
	}
	if e, ok := lpCache.Load(raw); ok {
		if ent := e.(lpEntry); time.Now().Before(ent.exp) {
			writeJSON(w, ent.data)
			return
		}
		lpCache.Delete(raw)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 7*time.Second)
	defer cancel()
	data, err := fetchLinkPreview(ctx, raw)
	if err != nil {
		// Cache failures briefly too, so a dead link isn't re-fetched per render.
		lpCache.Store(raw, lpEntry{data: data, exp: time.Now().Add(10 * time.Minute)})
		writeJSON(w, data) // empty preview - the client hides the card
		return
	}
	lpCache.Store(raw, lpEntry{data: data, exp: time.Now().Add(24 * time.Hour)})
	writeJSON(w, data)
}
