package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/simpulx/v2/libs/go/config"
)

// ── Self-serve onboarding + top-ups (manually approved) ─────────────────────
//
// The public form submits a REQUEST; a human approves it in the Platform panel.
// Nothing about the submission path can create an org, grant credits or touch
// tenant data, which is what makes the endpoint safe to expose without auth: the
// worst an abuser can do is fill a queue an operator reads anyway.

// signupPackage / topupPackage are the single source of pricing truth. Amounts
// are computed HERE at submission and frozen on the row, so the number the
// operator approves is the number the requester saw, even if pricing changes in
// between. Never trust an amount from the client.
type signupPackage struct {
	Label        string
	PerSeat      float64 // Rp / seat / month
	BonusCredits int
	TrialDays    int // >0 = trial package
	MinSeats     int // volume bracket floor; enforced server-side
}

// Every paid tier has the SAME features; the tiers are seat-volume brackets and
// the per-seat price FALLS as the team grows (a volume discount), it does not
// rise. MinSeats is enforced server-side so a 2-seat request cannot claim the
// 10-seat price. Managed ads is an optional add-on conversation, not a tier gate.
var signupPackages = map[string]signupPackage{
	// 7 days, 50 credits, no charge. Long enough to feel the product on real
	// leads, short enough that "we'll decide later" has a date attached.
	"trial":    {Label: "Free Trial", PerSeat: 0, BonusCredits: 50, TrialDays: 7},
	"starter":  {Label: "Starter", PerSeat: 200_000, BonusCredits: 200, MinSeats: 1},
	"growth":   {Label: "Growth", PerSeat: 150_000, BonusCredits: 200, MinSeats: 5},
	"business": {Label: "Business", PerSeat: 100_000, BonusCredits: 200, MinSeats: 10},
}

type topupPackage struct {
	Label     string
	Credits   int
	PerCredit float64 // floor Rp 350 per the pricing decision; cheaper only with volume
}

var topupPackages = map[string]topupPackage{
	"booster":    {Label: "Booster", Credits: 500, PerCredit: 400},
	"pro":        {Label: "Pro", Credits: 1000, PerCredit: 375},
	"enterprise": {Label: "Enterprise", Credits: 2000, PerCredit: 350},
}

// POST /api/public/register — the one public entry for both request kinds.
func (s *server) handlePublicRegister(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Type    string `json:"type"` // signup | topup
		OrgName string `json:"org_name"`
		// Industry uses the same segment vocabulary campaigns do.
		Industry string `json:"industry"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		Package  string `json:"package"`
		Seats    int    `json:"seats"`
		Note     string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	b.Email = strings.ToLower(strings.TrimSpace(b.Email))
	b.Name = strings.TrimSpace(b.Name)
	b.OrgName = strings.TrimSpace(b.OrgName)
	if b.Name == "" || !strings.Contains(b.Email, "@") {
		http.Error(w, "nama dan email yang valid wajib diisi", http.StatusBadRequest)
		return
	}
	// Length caps: this is an unauthenticated endpoint and these fields end up in
	// operator email; unbounded input is how a form becomes a spam cannon.
	for _, f := range []*string{&b.OrgName, &b.Industry, &b.Name, &b.Email, &b.Phone, &b.Note} {
		if len(*f) > 500 {
			*f = (*f)[:500]
		}
	}

	var credits, seats int
	var amount float64
	switch b.Type {
	case "signup":
		if b.OrgName == "" {
			http.Error(w, "nama bisnis wajib diisi", http.StatusBadRequest)
			return
		}
		pkg, ok := signupPackages[b.Package]
		if !ok {
			http.Error(w, "paket tidak dikenal", http.StatusBadRequest)
			return
		}
		seats = b.Seats
		if seats < 1 {
			seats = 1
		}
		if seats > 100 {
			seats = 100
		}
		// The bracket floor is what makes the volume discount honest: without it a
		// 2-seat request could claim the 10-seat price.
		if pkg.MinSeats > 0 && seats < pkg.MinSeats {
			seats = pkg.MinSeats
		}
		if pkg.TrialDays > 0 {
			seats = 1 // a trial is one seat; more is a sales conversation
		}
		credits = pkg.BonusCredits
		amount = pkg.PerSeat * float64(seats)
	case "topup":
		pkg, ok := topupPackages[b.Package]
		if !ok {
			http.Error(w, "paket top up tidak dikenal", http.StatusBadRequest)
			return
		}
		credits = pkg.Credits
		amount = pkg.PerCredit * float64(pkg.Credits)
	default:
		http.Error(w, "type must be signup or topup", http.StatusBadRequest)
		return
	}

	// Drop exact duplicates still sitting in the queue, so double-clicking submit
	// (or resubmitting after an unclear success screen) does not enqueue twice.
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO platform_transactions
		   (type, org_name, industry, contact_name, contact_email, contact_phone,
		    package_name, seats, credits, amount, note)
		 SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
		  WHERE NOT EXISTS (SELECT 1 FROM platform_transactions
		                     -- $12..$14 repeat $1/$5/$7 ON PURPOSE. Reusing one parameter
		                     -- in the insert list (varchar column) AND a comparison makes
		                     -- Postgres deduce two types for it and refuse the statement
		                     -- ("inconsistent types deduced", 42P08); a one-sided cast just
		                     -- moves the mismatch. Separate parameters end the tug-of-war.
		                     -- psql never shows this because literals carry their own type.
		                     WHERE type=$12 AND contact_email=$13 AND package_name=$14
		                       AND status='pending' AND created_at > now() - interval '1 hour')
		 RETURNING id::text`,
		b.Type, b.OrgName, b.Industry, b.Name, b.Email, b.Phone,
		b.Package, seats, credits, amount, b.Note,
		b.Type, b.Email, b.Package).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		// The WHERE NOT EXISTS filtered it: an identical request is already in the
		// queue, and "already received" is the truthful success for a double-click.
		writeJSON(w, map[string]any{"status": "received"})
		return
	}
	if err != nil {
		// The first version of this handler treated EVERY error as the duplicate
		// case and answered "received" while inserting nothing -- a lost sales lead
		// with a success screen on top, found because verification counted the rows
		// (0) after the endpoint said yes. Real failures must fail visibly.
		s.log.Error("register: insert failed", "type", b.Type, "email", b.Email, "err", err)
		http.Error(w, "gagal menyimpan permintaan, coba lagi sebentar lagi", http.StatusInternalServerError)
		return
	}

	// Tell the operator NOW, not whenever they next open the panel: a signup is a
	// sales lead, and lead response time is the product's own pitch.
	if to := strings.TrimSpace(config.Get("ADS_ALERT_EMAIL", "")); to != "" {
		kind := "Pendaftaran baru"
		if b.Type == "topup" {
			kind = "Permintaan top up"
		}
		subj := fmt.Sprintf("[Simpulx] %s: %s (%s)", kind, firstNonEmpty(b.OrgName, b.Name), b.Package)
		body := fmt.Sprintf(
			`<div style="font-family:system-ui,sans-serif;font-size:14px"><p>%s</p>
			 <table cellpadding="4">
			 <tr><td>Nama</td><td><strong>%s</strong></td></tr>
			 <tr><td>Email</td><td>%s</td></tr>
			 <tr><td>Telepon</td><td>%s</td></tr>
			 <tr><td>Bisnis</td><td>%s (%s)</td></tr>
			 <tr><td>Paket</td><td>%s, %d kredit, %s</td></tr>
			 </table>
			 <p>Approve di Settings &rarr; Transactions.</p></div>`,
			kind, html.EscapeString(b.Name), html.EscapeString(b.Email), html.EscapeString(b.Phone),
			html.EscapeString(b.OrgName), html.EscapeString(b.Industry),
			html.EscapeString(b.Package), credits, rupiah(amount))
		if sent, err := s.sendMail(to, subj, body); err != nil || !sent {
			s.log.Warn("register: operator notification not delivered", "sent", sent, "err", err)
		}
	}
	writeJSON(w, map[string]any{"status": "received", "id": id})
}

// GET /api/platform/transactions — the queue + the dashboard numbers in one call.
func (s *server) handleListTransactions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queryMaps(r.Context(),
		`SELECT t.id::text AS id, t.type, t.status, t.org_name, t.industry,
		        t.contact_name, t.contact_email, t.contact_phone,
		        t.package_name, t.seats, t.credits, t.amount::float8 AS amount,
		        t.organization_id::text AS organization_id, o.name AS org_linked_name,
		        t.note, t.decision_note, t.invoice_no, t.created_at, t.decided_at,
		        t.payment_proof_url, t.proof_uploaded_at
		   FROM platform_transactions t
		   LEFT JOIN organizations o ON o.id = t.organization_id
		  ORDER BY (t.status='pending') DESC, t.created_at DESC
		  LIMIT 300`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	sum, _ := s.queryMaps(r.Context(),
		`SELECT count(*) FILTER (WHERE status='pending')                                  AS pending,
		        count(*) FILTER (WHERE status='approved'
		                          AND decided_at >= date_trunc('month', now()))           AS approved_month,
		        COALESCE(sum(amount) FILTER (WHERE status='approved'
		                          AND decided_at >= date_trunc('month', now())),0)::float8 AS amount_month,
		        count(*) FILTER (WHERE type='signup' AND package_name='trial'
		                          AND status='approved')                                   AS trials_approved
		   FROM platform_transactions`)
	summary := map[string]any{}
	if len(sum) > 0 {
		summary = sum[0]
	}
	writeJSON(w, map[string]any{"rows": rows, "summary": summary})
}

// POST /api/platform/transactions/{id}/approve
//
// Approval is where things actually happen: a signup creates the organisation
// (trial gets 7 days + 50 credits; a paid package gets its seats and bonus
// credits), a top-up adds credits to an existing org. The invoice number is
// claimed here, inside the same transaction, so numbers stay sequential and only
// approved requests ever get one.
func (s *server) handleApproveTransaction(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var b struct {
		// topup only: which org receives the credits. Explicit rather than matched
		// by email, because guessing the tenant money lands on is not a place to
		// be clever.
		OrganizationID string `json:"organization_id"`
		Note           string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&b)

	var typ, pkgName, orgName, industry, contactName, contactEmail string
	var seats, credits int
	var amount float64
	err := s.pool.QueryRow(r.Context(),
		`SELECT type, package_name, COALESCE(org_name,''), COALESCE(industry,''),
		        contact_name, contact_email, COALESCE(seats,1), credits, amount::float8
		   FROM platform_transactions WHERE id=$1::uuid AND status='pending'`, id).
		Scan(&typ, &pkgName, &orgName, &industry, &contactName, &contactEmail, &seats, &credits, &amount)
	if err != nil {
		http.Error(w, "not found or already decided", http.StatusNotFound)
		return
	}

	var orgID string
	switch typ {
	case "signup":
		pkg := signupPackages[pkgName]
		subStatus, renewal := "active", ""
		if pkg.TrialDays > 0 {
			subStatus = "trial"
			renewal = time.Now().AddDate(0, 0, pkg.TrialDays).Format("2006-01-02")
		}
		newOrgID, _, err := s.createOrganization(r.Context(), createOrgInput{
			Name: orgName, Industry: industry,
			OwnerName: contactName, OwnerEmail: contactEmail,
			PackageName: pkgName, Users: seats, SimpulerCredits: credits,
			SubscriptionStatus: subStatus, RenewalDate: renewal,
			SendWelcome: true,
		})
		if err != nil {
			http.Error(w, "could not create the organisation: "+err.Error(), http.StatusConflict)
			return
		}
		orgID = newOrgID
	case "topup":
		orgID = strings.TrimSpace(b.OrganizationID)
		if orgID == "" {
			http.Error(w, "pick which organisation receives the credits", http.StatusBadRequest)
			return
		}
		// Credits are a monthly quota bump on the org pool (the same number the
		// low-credit alert and the subscription page read).
		tag, err := s.pool.Exec(r.Context(),
			`UPDATE org_subscriptions
			    SET quotas = jsonb_set(COALESCE(quotas,'{}'::jsonb), '{simpuler_credits}',
			          to_jsonb(COALESCE((quotas->>'simpuler_credits')::int,0) + $2), true),
			        updated_at = now()
			  WHERE organization_id=$1::uuid`, orgID, credits)
		if err != nil || tag.RowsAffected() == 0 {
			http.Error(w, "that organisation has no subscription row to credit", http.StatusConflict)
			return
		}
	}

	if _, err := s.pool.Exec(r.Context(),
		`UPDATE platform_transactions
		    SET status='approved', decided_by=$2::uuid, decided_at=now(),
		        decision_note=NULLIF($3,''), organization_id=$4::uuid,
		        invoice_no = CASE WHEN amount > 0 THEN nextval('platform_invoice_seq') ELSE NULL END
		  WHERE id=$1::uuid`, id, a.UserID, b.Note, orgID); err != nil {
		// The side effect already happened; say so plainly instead of implying a
		// clean failure. This row can be re-approved manually.
		http.Error(w, "the change was applied but recording the approval failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "approved", "platform_transaction", id, map[string]any{
		"type": typ, "package": pkgName, "org": orgID, "amount": amount,
	})
	writeJSON(w, map[string]any{"status": "approved", "organization_id": orgID})
}

// POST /api/platform/transactions/{id}/reject
func (s *server) handleRejectTransaction(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&b)
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE platform_transactions
		    SET status='rejected', decided_by=$2::uuid, decided_at=now(), decision_note=NULLIF($3,'')
		  WHERE id=$1::uuid AND status='pending'`, r.PathValue("id"), a.UserID, b.Note)
	if err != nil || tag.RowsAffected() == 0 {
		http.Error(w, "not found or already decided", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "rejected", "platform_transaction", r.PathValue("id"), nil)
	writeJSON(w, map[string]any{"status": "rejected"})
}

// GET /api/platform/transactions/{id}/invoice — printable invoice.
//
// HTML on purpose, not PDF: the browser's print-to-PDF does the rendering, which
// keeps the gateway free of a PDF dependency the P6 billing epic may replace
// anyway. Deliberately NO tax line: whether Simpulx invoices with PPN is an open
// P6 decision, and printing a guessed tax treatment is worse than printing none
// (mispresenting tax is a DJP problem, not a bug to revert).
func (s *server) handleTransactionInvoice(w http.ResponseWriter, r *http.Request) {
	row, err := s.queryMaps(r.Context(),
		`SELECT t.type, t.org_name, t.contact_name, t.contact_email, t.package_name,
		        t.seats, t.credits, t.amount::float8 AS amount, t.invoice_no,
		        t.decided_at, o.name AS org_linked
		   FROM platform_transactions t
		   LEFT JOIN organizations o ON o.id=t.organization_id
		  WHERE t.id=$1::uuid AND t.status='approved'`, r.PathValue("id"))
	if err != nil || len(row) == 0 {
		http.Error(w, "no invoice: the request is not approved", http.StatusNotFound)
		return
	}
	t := row[0]
	amount, _ := t["amount"].(float64)
	num := "-"
	if v, ok := t["invoice_no"].(int64); ok {
		num = fmt.Sprintf("INV-%d", v)
	}
	desc := ""
	if t["type"] == "signup" {
		pkg := signupPackages[t["package_name"].(string)]
		seats := t["seats"]
		desc = fmt.Sprintf("Langganan Simpulx paket %s, %v seat", pkg.Label, seats)
		if pkg.TrialDays > 0 {
			desc = fmt.Sprintf("Simpulx Free Trial %d hari", pkg.TrialDays)
		}
	} else {
		pkg := topupPackages[t["package_name"].(string)]
		desc = fmt.Sprintf("Top up %d kredit AI (paket %s)", pkg.Credits, pkg.Label)
	}
	billTo := firstNonEmpty(strAt(t, "org_linked"), strAt(t, "org_name"), strAt(t, "contact_name"))
	date := ""
	if d, ok := t["decided_at"].(time.Time); ok {
		date = d.Format("2 January 2006")
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>%s</title>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:640px;margin:40px auto;padding:0 24px}
 .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
 .brand{font-size:22px;font-weight:800;color:#0E5B54}
 table{width:100%%;border-collapse:collapse;margin:24px 0}
 th{font-size:12px;text-align:left;color:#777;border-bottom:2px solid #eee;padding:8px 4px}
 td{padding:10px 4px;border-bottom:1px solid #f0f0f0;font-size:14px}
 .tot td{font-weight:800;font-size:16px;border-bottom:none}
 .muted{color:#777;font-size:12.5px}
 @media print{.noprint{display:none}}
</style></head><body>
<div class="head">
  <div><div class="brand">Simpulx</div><div class="muted">app.simpulx.com</div></div>
  <div style="text-align:right"><div style="font-weight:700">%s</div><div class="muted">%s</div></div>
</div>
<p class="muted">Ditagihkan kepada</p>
<p style="font-weight:700;margin:2px 0 0">%s</p>
<p class="muted" style="margin:2px 0 24px">%s</p>
<table>
 <tr><th>Deskripsi</th><th style="text-align:right">Jumlah</th></tr>
 <tr><td>%s</td><td style="text-align:right">%s</td></tr>
 <tr class="tot"><td>Total</td><td style="text-align:right">%s</td></tr>
</table>
<p class="muted">Bukan faktur pajak. Pembayaran dikonfirmasi manual oleh tim Simpulx.</p>
<button class="noprint" onclick="print()" style="margin-top:16px;padding:10px 18px;border-radius:8px;border:0;background:#0E5B54;color:#fff;font-weight:700;cursor:pointer">Download PDF</button>
</body></html>`,
		num, num, html.EscapeString(date), html.EscapeString(billTo),
		html.EscapeString(strAt(t, "contact_email")),
		html.EscapeString(desc), rupiah(amount), rupiah(amount))
}

func strAt(m map[string]any, k string) string {
	if v, ok := m[k].(string); ok {
		return v
	}
	return ""
}

// POST /api/public/register/{id}/proof — attach a transfer receipt to a PENDING
// request. Public like the register endpoint itself, and bounded the same way:
// it can only attach an image/PDF to a request that is still pending, sized and
// typed strictly, and re-uploading replaces the previous file. The worst an
// abuser can do is decorate their own pending row.
func (s *server) handleRegisterProof(w http.ResponseWriter, r *http.Request) {
	if s.storage == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}
	id := r.PathValue("id")
	var exists bool
	if err := s.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM platform_transactions WHERE id=$1::uuid AND status='pending')`,
		id).Scan(&exists); err != nil || !exists {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// 8MB is plenty for a receipt photo; anything bigger is a mistake or abuse.
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		http.Error(w, "file terlalu besar (maks 8MB)", http.StatusRequestEntityTooLarge)
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	ct := hdr.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "image/") && ct != "application/pdf" {
		http.Error(w, "bukti transfer harus berupa foto atau PDF", http.StatusBadRequest)
		return
	}

	key := "transfer-proofs/" + id + "/" + strings.ReplaceAll(hdr.Filename, " ", "-")
	urlStr, err := s.storage.put(r.Context(), key, ct, file, hdr.Size)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE platform_transactions
		    SET payment_proof_url=$2, proof_uploaded_at=now()
		  WHERE id=$1::uuid AND status='pending'`, id, urlStr); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "uploaded"})
}

// GET /api/public/payment-info — the transfer instructions the register wizard
// shows before the proof upload. Comes from env, NOT code: the account number is
// operational data the operator owns, and a wrong hardcoded account number would
// send customer money to the void. Empty = the UI says instructions follow by
// email instead of inventing any.
func (s *server) handlePaymentInfo(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"bank":    config.Get("PAYMENT_BANK_NAME", ""),
		"account": config.Get("PAYMENT_BANK_ACCOUNT", ""),
		"holder":  config.Get("PAYMENT_BANK_HOLDER", ""),
	})
}
