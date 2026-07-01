// Package mailer sends email via SMTP, shared by the gateway (password reset)
// and the messaging automation executor (Send Email Notification node).
package mailer

import (
	"fmt"
	"net/smtp"
	"strings"

	"github.com/simpulx/v2/libs/go/config"
)

// Send sends an email via SMTP. Config from env: SMTP_HOST, SMTP_PORT (587),
// SMTP_USER, SMTP_PASS, SMTP_FROM (=SMTP_USER), SMTP_FROM_NAME ("Simpulx").
// Returns sent=false with no error when SMTP is not configured (local/dev).
func Send(to, subject, body string, html bool) (sent bool, err error) {
	host := config.Get("SMTP_HOST", "")
	if host == "" || strings.TrimSpace(to) == "" {
		return false, nil
	}
	port := config.Get("SMTP_PORT", "587")
	user := config.Get("SMTP_USER", "")
	pass := config.Get("SMTP_PASS", "")
	from := config.Get("SMTP_FROM", user)
	fromName := config.Get("SMTP_FROM_NAME", "Simpulx")

	ct := `text/plain; charset="UTF-8"`
	if html {
		ct = `text/html; charset="UTF-8"`
	}
	headers := map[string]string{
		"From":         fmt.Sprintf("%s <%s>", fromName, from),
		"To":           to,
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": ct,
	}
	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(k + ": " + v + "\r\n")
	}
	msg.WriteString("\r\n" + body)

	var auth smtp.Auth
	if user != "" {
		auth = smtp.PlainAuth("", user, pass, host)
	}
	if err := smtp.SendMail(host+":"+port, auth, from, []string{to}, []byte(msg.String())); err != nil {
		return false, err
	}
	return true, nil
}
