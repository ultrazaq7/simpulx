// Package mailer sends email via the Amazon SES v2 API, shared by the gateway
// (password reset / welcome / credit alerts) and the messaging automation
// executor (Send Email Notification node).
//
// Why the SES API and not SMTP: AWS does NOT expose an SMTP endpoint in the
// ap-southeast-3 (Jakarta) region — email-smtp.ap-southeast-3.amazonaws.com has no
// DNS record, so the old net/smtp path failed at "no such host" on every send and
// no email was ever delivered. The SES *API* endpoint (email.ap-southeast-3...)
// does resolve and the domain (simpulx.com) is already DKIM-verified there, so we
// send through the API with the EC2 instance-role credentials (default chain).
package mailer

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"

	"github.com/simpulx/v2/libs/go/config"
)

var (
	clientOnce sync.Once
	sesClient  *sesv2.Client
	clientErr  error
)

// sesRegion is where SES + the verified domain live. SES_REGION overrides it;
// falls back to AWS_REGION, then the Jakarta default.
func sesRegion() string {
	if r := config.Get("SES_REGION", ""); r != "" {
		return r
	}
	if r := config.Get("AWS_REGION", ""); r != "" {
		return r
	}
	return "ap-southeast-3"
}

func client() (*sesv2.Client, error) {
	clientOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(sesRegion()))
		if err != nil {
			clientErr = err
			return
		}
		sesClient = sesv2.NewFromConfig(cfg)
	})
	return sesClient, clientErr
}

// Send sends an email via the SES v2 API. From address comes from SMTP_FROM (the
// verified sender), display name from SMTP_FROM_NAME ("Simpulx"). Returns
// sent=false with no error when no sender is configured (local/dev) so callers can
// treat it as a no-op; a real send failure returns err so the caller can retry or
// alert (never mark an email "sent" on sent=false).
func Send(to, subject, body string, html bool) (sent bool, err error) {
	from := config.Get("SMTP_FROM", config.Get("SMTP_USER", ""))
	if from == "" || strings.TrimSpace(to) == "" {
		return false, nil
	}
	fromName := config.Get("SMTP_FROM_NAME", "Simpulx")

	c, err := client()
	if err != nil {
		return false, fmt.Errorf("ses config: %w", err)
	}

	content := &types.Content{Data: aws.String(body), Charset: aws.String("UTF-8")}
	bodyBlock := &types.Body{}
	if html {
		bodyBlock.Html = content
	} else {
		bodyBlock.Text = content
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_, err = c.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(fmt.Sprintf("%s <%s>", fromName, from)),
		Destination:      &types.Destination{ToAddresses: []string{to}},
		Content: &types.EmailContent{
			Simple: &types.Message{
				Subject: &types.Content{Data: aws.String(subject), Charset: aws.String("UTF-8")},
				Body:    bodyBlock,
			},
		},
	})
	if err != nil {
		return false, err
	}
	return true, nil
}
