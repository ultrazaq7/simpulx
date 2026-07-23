package main

import (
	"fmt"

	"github.com/simpulx/v2/libs/go/mailer"
)

// sendMail delegates to libs/go/mailer, which sends through Google Workspace
// SMTP relay (smtp-relay.gmail.com, IP-based auth).
//
// Contract: sent=false with a nil error means "not configured" (local dev),
// and callers must check `sent` rather than only `err` before recording
// anything as delivered.
//
// Every system email goes out inside brandWrap, so the header exists in ONE
// place instead of being copy-pasted into each body builder (and inevitably
// drifting). Automation-node emails (messaging service) are deliberately NOT
// wrapped: that is the client's own content to their customers, not ours.
func (s *server) sendMail(to, subject, htmlBody string) (sent bool, err error) {
	return mailer.Send(to, subject, brandWrap(htmlBody), true)
}

// brandWrap frames an email body with the Simpulx brand header — logo + the
// landing-page wordmark (dark "Simpul", amber "x", #C9871F from the landing
// palette) — a white card around the content, and a one-line footer. Inline
// styles only and the logo by absolute URL: email clients ignore stylesheets
// and strip everything else.
func brandWrap(inner string) string {
	return `<div style="background:#f4f6f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto">
    <div style="padding:4px 8px 14px">
      <img src="https://simpulx.com/favicon.png" width="34" height="34" alt="Simpulx" style="vertical-align:middle;border-radius:9px">
      <span style="font-size:20px;font-weight:800;color:#10201d;vertical-align:middle;margin-left:9px;letter-spacing:-0.3px">Simpul<span style="color:#C9871F">x</span></span>
    </div>
    <div style="background:#ffffff;border:1px solid #e5e8e7;border-radius:12px;overflow:hidden">` + inner + `</div>
    <p style="text-align:center;color:#9aa3a0;font-size:11px;margin:14px 0 0">Simpulx &middot; Inbox WhatsApp + AI untuk tim sales &middot; <a href="https://simpulx.com" style="color:#9aa3a0">simpulx.com</a></p>
  </div>
</div>`
}

func resetEmailHTML(name, link string) string {
	if name == "" {
		name = "there"
	}
	return fmt.Sprintf(`<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="margin:0 0 8px">Reset your password</h2>
  <p style="color:#555;font-size:14px;line-height:1.6">Hi %s, we received a request to reset your Simpulx password. Click the button below to choose a new one. This link expires in 1 hour.</p>
  <p style="margin:24px 0">
    <a href="%s" style="background:#2D8B73;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Reset password</a>
  </p>
  <p style="color:#888;font-size:12px;line-height:1.6">If the button does not work, copy this link into your browser:<br><a href="%s" style="color:#2D8B73">%s</a></p>
  <p style="color:#888;font-size:12px;margin-top:24px">If you did not request this, you can safely ignore this email.</p>
</div>`, name, link, link, link)
}

// welcomeEmailHTML greets a freshly created user and points them at a
// set-password link so they choose their own credentials on first sign-in.
func welcomeEmailHTML(name, link, email string) string {
	if name == "" {
		name = "there"
	}
	return fmt.Sprintf(`<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="margin:0 0 8px">Welcome to Simpulx</h2>
  <p style="color:#555;font-size:14px;line-height:1.6">Hi %s, an account has been created for you on Simpulx with the email <b>%s</b>. Click the button below to set your password and sign in. This link expires in 7 days.</p>
  <p style="margin:24px 0">
    <a href="%s" style="background:#2D8B73;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Set your password</a>
  </p>
  <p style="color:#888;font-size:12px;line-height:1.6">If the button does not work, copy this link into your browser:<br><a href="%s" style="color:#2D8B73">%s</a></p>
  <p style="color:#888;font-size:12px;margin-top:24px">If you were not expecting this, you can safely ignore this email.</p>
</div>`, name, email, link, link, link)
}

func emailChangeHTML(name, link, newEmail string) string {
	if name == "" {
		name = "there"
	}
	return fmt.Sprintf(`<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="margin:0 0 8px">Confirm your new email</h2>
  <p style="color:#555;font-size:14px;line-height:1.6">Hi %s, a request was made to change your Simpulx sign-in email to <b>%s</b>. Click the button below to confirm. This link expires in 1 hour. Your email will not change until you confirm.</p>
  <p style="margin:24px 0">
    <a href="%s" style="background:#2D8B73;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Confirm new email</a>
  </p>
  <p style="color:#888;font-size:12px;line-height:1.6">If the button does not work, copy this link into your browser:<br><a href="%s" style="color:#2D8B73">%s</a></p>
  <p style="color:#888;font-size:12px;margin-top:24px">If you did not request this, you can safely ignore this email and your address stays the same.</p>
</div>`, name, newEmail, link, link, link)
}
