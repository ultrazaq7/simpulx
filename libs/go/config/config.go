// Package config memuat konfigurasi dari environment variable.
package config

import (
	"os"
	"strconv"
)

// Get mengembalikan env var atau fallback bila kosong.
func Get(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// GetInt mengembalikan env var sebagai int atau fallback.
func GetInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// GetBool mengembalikan true untuk "1","true","yes" (case-insensitive-ish).
func GetBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	switch v {
	case "1", "true", "TRUE", "yes", "YES":
		return true
	case "0", "false", "FALSE", "no", "NO":
		return false
	default:
		return fallback
	}
}
