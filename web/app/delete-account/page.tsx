"use client";

import { useState } from "react";

export default function DeleteAccountPage() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would send a request to the backend
    setSubmitted(true);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0B1413 0%, #1a2f2b 100%)",
        fontFamily: "'Inter', sans-serif",
        padding: "20px",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#fff",
          borderRadius: 16,
          padding: "48px 40px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#2D8B73",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17L4 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#111827",
              margin: "0 0 8px",
            }}
          >
            Delete Your Simpulx Account
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
            We&apos;re sorry to see you go. Submitting this form will initiate the
            deletion of your account and all associated data.
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit}>
            {/* What gets deleted */}
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 24,
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#991B1B",
                  margin: "0 0 8px",
                }}
              >
                ⚠️ The following data will be permanently deleted:
              </p>
              <ul
                style={{
                  fontSize: 13,
                  color: "#7F1D1D",
                  margin: 0,
                  paddingLeft: 20,
                  lineHeight: 1.8,
                }}
              >
                <li>Your profile and account credentials</li>
                <li>All conversation history and messages</li>
                <li>Contacts and customer data</li>
                <li>Campaign and broadcast history</li>
                <li>Uploaded media and files</li>
              </ul>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#374151",
                  marginBottom: 6,
                }}
              >
                Email address associated with your account *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: 8,
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Reason */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#374151",
                  marginBottom: 6,
                }}
              >
                Reason for leaving (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Tell us why you're leaving..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: 8,
                  fontSize: 14,
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Retention period */}
            <p
              style={{
                fontSize: 12,
                color: "#9CA3AF",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              Your deletion request will be processed within 30 days. During this
              period, you may contact{" "}
              <a href="mailto:support@simpulx.com" style={{ color: "#2D8B73" }}>
                support@simpulx.com
              </a>{" "}
              to cancel the request.
            </p>

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                background: "#DC2626",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Request Account Deletion
            </button>
          </form>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#D1FAE5",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17L4 12" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: "0 0 8px" }}>
              Request Submitted
            </h2>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
              We&apos;ve received your deletion request for <strong>{email}</strong>.
              Your account and data will be deleted within 30 days. You&apos;ll receive
              a confirmation email once the process is complete.
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid #E5E7EB",
          }}
        >
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
            © {new Date().getFullYear()} Simpulx. All rights reserved. ·{" "}
            <a href="https://simpulx.com/privacy.html" style={{ color: "#2D8B73" }}>
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
