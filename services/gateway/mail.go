package main

import (
	"fmt"

	"github.com/simpulx/v2/libs/go/mailer"
)

// sendMail delegates to libs/go/mailer, which sends through the Amazon SES v2
// API.
//
// It used to speak SMTP here directly, with its own net/smtp copy. That path was
// DEAD in production: AWS exposes no SMTP endpoint in ap-southeast-3, so every
// send failed at "lookup email-smtp.ap-southeast-3.amazonaws.com: no such host".
// libs/go/mailer was moved to the SES API for exactly that reason back in 7b3ee00,
// but this copy was never pointed at it, so password resets, welcome mails, credit
// alerts and ads alerts all kept using the broken route while the shared library
// looked fixed.
//
// Contract is unchanged: sent=false with a nil error means "not configured"
// (local dev), and callers must check `sent` rather than only `err` before
// recording anything as delivered.
func (s *server) sendMail(to, subject, htmlBody string) (sent bool, err error) {
	return mailer.Send(to, subject, htmlBody, true)
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
