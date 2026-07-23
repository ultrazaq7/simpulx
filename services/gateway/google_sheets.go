package main

import (
	"context"
	"net/http"

	"github.com/simpulx/v2/libs/go/gsheets"
)

// Google Sheets connector - thin wrappers over libs/go/gsheets (shared with the
// messaging automation executor). The service-account key comes from
// GOOGLE_SA_KEY_B64; never committed.

func googleSAEmail() string { return gsheets.Email() }

func parseSpreadsheetID(s string) string { return gsheets.ParseSpreadsheetID(s) }

func (s *server) appendSheetRow(ctx context.Context, spreadsheetID, tab string, row []string) error {
	return gsheets.AppendRow(ctx, s.httpClient, spreadsheetID, tab, row)
}

// GET /api/integrations/google-sheets - connection status + the service-account
// email the user must share their sheet with.
func (s *server) handleGoogleSheetsInfo(w http.ResponseWriter, r *http.Request) {
	email := gsheets.Email()
	writeJSON(w, map[string]any{"connected": email != "", "client_email": email})
}
