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

// broadcast mengirim payload ke semua client pada org tertentu (non-blocking).
func (h *hub) broadcast(orgID string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients[orgID] {
		select {
		case c.send <- payload:
		default:
			// buffer penuh — lewati agar tidak memblokir hub
		}
	}
}
