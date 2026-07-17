package main

import (
	"fmt"
	"net/smtp"
	"strings"

	"github.com/simpulx/v2/libs/go/config"
)

// sendMail sends a simple HTML email via SMTP. Configuration is read from env:
//
//	SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS,
//	SMTP_FROM (default SMTP_USER), SMTP_FROM_NAME (default "Simpulx").
//
// When SMTP_HOST is empty (e.g. local dev) the email is not sent; the caller is
// told so via the returned bool=false and should fall back to logging the link.
func (s *server) sendMail(to, subject, htmlBody string) (sent bool, err error) {
	host := config.Get("SMTP_HOST", "")
	if host == "" {
		return false, nil // not configured -> caller logs the link instead
	}
	port := config.Get("SMTP_PORT", "587")
	user := config.Get("SMTP_USER", "")
	pass := config.Get("SMTP_PASS", "")
	from := config.Get("SMTP_FROM", user)
	fromName := config.Get("SMTP_FROM_NAME", "Simpulx")

	headers := map[string]string{
		"From":         fmt.Sprintf("%s <%s>", fromName, from),
		"To":           to,
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": `text/html; charset="UTF-8"`,
	}
	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(k + ": " + v + "\r\n")
	}
	msg.WriteString("\r\n" + htmlBody)

	addr := host + ":" + port
	var auth smtp.Auth
	if user != "" {
		auth = smtp.PlainAuth("", user, pass, host)
	}
	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(msg.String())); err != nil {
		return false, err
	}
	return true, nil
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
