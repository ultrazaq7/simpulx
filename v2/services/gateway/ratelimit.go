package main

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ipLimiter provides per-IP token bucket rate limiting. Each unique IP gets its
// own rate.Limiter. A background goroutine evicts stale entries every 5 minutes
// to prevent memory leaks from a large number of unique IPs.
type ipLimiter struct {
	mu       sync.Mutex
	limiters map[string]*entry
	rps      rate.Limit
	burst    int
}

type entry struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

func newIPLimiter(rps float64, burst int) *ipLimiter {
	l := &ipLimiter{
		limiters: make(map[string]*entry),
		rps:      rate.Limit(rps),
		burst:    burst,
	}
	go l.cleanup()
	return l
}

func (l *ipLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	if e, ok := l.limiters[ip]; ok {
		e.lastSeen = time.Now()
		return e.lim
	}
	lim := rate.NewLimiter(l.rps, l.burst)
	l.limiters[ip] = &entry{lim: lim, lastSeen: time.Now()}
	return lim
}

// cleanup evicts entries not seen in the last 5 minutes.
func (l *ipLimiter) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		l.mu.Lock()
		cutoff := time.Now().Add(-5 * time.Minute)
		for ip, e := range l.limiters {
			if e.lastSeen.Before(cutoff) {
				delete(l.limiters, ip)
			}
		}
		l.mu.Unlock()
	}
}

// rateLimit returns middleware that applies IP-based rate limiting.
// Returns 429 Too Many Requests when the rate is exceeded.
func rateLimit(rps float64, burst int) func(http.HandlerFunc) http.HandlerFunc {
	limiter := newIPLimiter(rps, burst)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			// Use X-Forwarded-For if behind a reverse proxy
			if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
				ip = fwd
			}
			if !limiter.get(ip).Allow() {
				http.Error(w, "too many requests", http.StatusTooManyRequests)
				return
			}
			next(w, r)
		}
	}
}
