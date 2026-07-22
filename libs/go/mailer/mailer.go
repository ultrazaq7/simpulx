// Package mailer sends email via SMTP, shared by the gateway (password reset /
// welcome / credit alerts) and the messaging automation executor (Send Email
// Notification node).
//
// Production uses Google Workspace SMTP relay (smtp-relay.gmail.com) with
// IP-based authentication — the EC2 Elastic IP is whitelisted in Google Admin
// so no username/password is needed. The relay accepts mail from any
// @simpulx.com sender and delivers to any recipient.
//
// When SMTP_HOST is set to a server that requires authentication (e.g.
// smtp.gmail.com with an App Password), the mailer uses PLAIN auth over TLS.
//
// History: this package originally used the Amazon SES v2 API because AWS does
// not expose an SMTP endpoint in ap-southeast-3 (Jakarta). SES worked but
// remained stuck in sandbox mode (production access denied), limiting delivery
// to verified addresses only. Switched to Google Workspace SMTP relay to
// remove that restriction.
package mailer

import (
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/config"
)

// Send sends an email via SMTP. From address comes from SMTP_FROM (falls back
// to SMTP_USER), display name from SMTP_FROM_NAME ("Simpulx"). Returns
// sent=false with no error when no sender is configured (local/dev) so callers
// can treat it as a no-op; a real send failure returns err so the caller can
// retry or alert (never mark an email "sent" on sent=false).
func Send(to, subject, body string, html bool) (sent bool, err error) {
	from := config.Get("SMTP_FROM", config.Get("SMTP_USER", ""))
	if from == "" || strings.TrimSpace(to) == "" {
		return false, nil
	}

	host := config.Get("SMTP_HOST", "smtp-relay.gmail.com")
	port := config.Get("SMTP_PORT", "587")
	user := config.Get("SMTP_USER", "")
	pass := config.Get("SMTP_PASS", "")
	fromName := config.Get("SMTP_FROM_NAME", "Simpulx")

	addr := net.JoinHostPort(host, port)

	// Build the RFC 2822 message.
	contentType := "text/plain; charset=UTF-8"
	if html {
		contentType = "text/html; charset=UTF-8"
	}
	encodedName := mime.QEncoding.Encode("UTF-8", fromName)
	msg := fmt.Sprintf("From: %s <%s>\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: %s\r\n"+
		"\r\n"+
		"%s",
		encodedName, from, to,
		mime.QEncoding.Encode("UTF-8", subject),
		contentType, body,
	)

	// Dial with a timeout so a DNS/network issue doesn't hang the caller.
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return false, fmt.Errorf("smtp dial %s: %w", addr, err)
	}
	defer conn.Close()

	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return false, fmt.Errorf("smtp client: %w", err)
	}
	defer c.Close()

	// Go's smtp client EHLOs as "localhost" unless told otherwise, and Google's
	// relay answers that with 421 4.7.0 and DROPS the connection -- which then
	// surfaces as an unexplained EOF on the next command (MAIL FROM). Proven by
	// replaying the dialogue from this host: EHLO localhost -> 421 + close,
	// EHLO simpulx.com -> everything through MAIL FROM answers 250. Must be the
	// first command on the connection.
	if err = c.Hello(config.Get("SMTP_EHLO", "simpulx.com")); err != nil {
		return false, fmt.Errorf("smtp ehlo: %w", err)
	}

	// STARTTLS — required by the Google SMTP relay and good practice everywhere.
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err = c.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return false, fmt.Errorf("smtp starttls: %w", err)
		}
	}

	// Authenticate only when credentials are provided. Google Workspace SMTP
	// relay with IP-based auth does not need (and rejects) LOGIN/PLAIN.
	if user != "" && pass != "" {
		auth := smtp.PlainAuth("", user, pass, host)
		if err = c.Auth(auth); err != nil {
			return false, fmt.Errorf("smtp auth: %w", err)
		}
	}

	// Envelope.
	if err = c.Mail(from); err != nil {
		return false, fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err = c.Rcpt(to); err != nil {
		return false, fmt.Errorf("smtp RCPT TO: %w", err)
	}

	// Data.
	w, err := c.Data()
	if err != nil {
		return false, fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err = w.Write([]byte(msg)); err != nil {
		return false, fmt.Errorf("smtp write: %w", err)
	}
	if err = w.Close(); err != nil {
		return false, fmt.Errorf("smtp close data: %w", err)
	}

	c.Quit()
	return true, nil
}
