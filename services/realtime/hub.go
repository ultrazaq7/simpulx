package main

import (
	"sync"

	"github.com/gorilla/websocket"
)

// client adalah satu koneksi WebSocket dashboard.
type client struct {
	orgID string
	conn  *websocket.Conn
	send  chan []byte
}

// hub menyimpan koneksi aktif per organisasi dan menyiarkan pesan ke mereka.
type hub struct {
	mu      sync.RWMutex
	clients map[string]map[*client]bool // orgID -> set client
}

func newHub() *hub {
	return &hub{clients: make(map[string]map[*client]bool)}
}

func (h *hub) add(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[c.orgID] == nil {
		h.clients[c.orgID] = make(map[*client]bool)
	}
	h.clients[c.orgID][c] = true
}

func (h *hub) remove(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.clients[c.orgID]; set != nil {
		if _, ok := set[c]; ok {
			delete(set, c)
			close(c.send)
		}
		if len(set) == 0 {
			delete(h.clients, c.orgID)
		}
	}
}

// broadcast mengirim payload ke semua client pada org tertentu. Hot path pakai
// RLock (broadcast antar-org tetap paralel). Client yang buffer-nya penuh
// (terlalu lambat) DITUTUP, bukan diam-diam di-skip: kalau di-skip ia kehilangan
// event permanen (baru muncul lagi kalau refresh manual). Dengan ditutup ia
// reconnect lalu re-fetch, jadi tidak ada event yang hilang.
func (h *hub) broadcast(orgID string, payload []byte) {
	var slow []*client
	h.mu.RLock()
	for c := range h.clients[orgID] {
		select {
		case c.send <- payload:
		default:
			slow = append(slow, c) // buffer penuh -> tandai untuk ditutup
		}
	}
	h.mu.RUnlock()
	// remove() butuh Lock (tidak bisa upgrade dari RLock), jadi lakukan di luar.
	// Aman & idempotent: remove hanya close(c.send) kalau c masih di set, dan
	// send hanya terjadi di bawah RLock (mutually exclusive dgn Lock), sehingga
	// tidak pernah "send on closed channel".
	for _, c := range slow {
		h.remove(c)
	}
}
