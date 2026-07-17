// Package db menyediakan koneksi PostgreSQL (pgx pool) dengan retry saat boot.
package db

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect membuka pool dan menunggu DB siap (retry ~30s).
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse db url: %w", err)
	}
	// Pool sizing is env-tunable so the hot service (the gateway) can be given more
	// connections WITHOUT a code change, while background workers stay small.
	//
	// HARD CEILING: the SUM of every service's pool must stay under Postgres
	// max_connections (100 on prod). With ~6-8 services connecting, a blanket 20
	// each = 120-160 > 100 and the DB starts refusing connections under load — so
	// the DEFAULT stays conservative at 10 (≈ the proven original) and you raise
	// ONLY the gateway via DB_MAX_CONNS once there's headroom. For real 1000-DAU
	// scale the right move is PgBouncer (transaction pooling) in front of Postgres:
	// then each service can hold many logical conns while PgBouncer multiplexes to a
	// small fixed set of real ones. Bumping these blindly without that is a footgun.
	cfg.MaxConns = envInt32("DB_MAX_CONNS", 10)
	cfg.MinConns = envInt32("DB_MIN_CONNS", 2) // keep a few warm so bursts don't pay connect latency
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.MaxConnLifetime = 30 * time.Minute // recycle so RDS failovers / stale conns self-heal

	var pool *pgxpool.Pool
	for i := 0; i < 30; i++ {
		pool, err = pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			if pingErr := pool.Ping(ctx); pingErr == nil {
				return pool, nil
			} else {
				err = pingErr
				pool.Close()
			}
		}
		time.Sleep(time.Second)
	}
	return nil, fmt.Errorf("db not ready: %w", err)
}

// envInt32 reads a positive integer from env, falling back to def.
func envInt32(key string, def int32) int32 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return int32(n)
		}
	}
	return def
}
