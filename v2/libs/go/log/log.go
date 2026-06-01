// Package log menyediakan logger terstruktur (slog) yang seragam antar-service.
package log

import (
	"log/slog"
	"os"
)

// New membuat logger JSON dengan nama service sebagai atribut tetap.
func New(service string) *slog.Logger {
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	return slog.New(h).With("service", service)
}
