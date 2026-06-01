package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	db, err := sql.Open("sqlite3", "simpulx.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, type, media_url FROM messages WHERE media_url != '' ORDER BY created_at DESC LIMIT 5")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, typ, mediaURL string
		rows.Scan(&id, &typ, &mediaURL)
		fmt.Printf("id=%s type=%s media_url=%s\n", id, typ, mediaURL)
	}
}
