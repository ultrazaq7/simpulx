"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function DeleteAccountPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/public/account-deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason: reason.trim() }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Request failed");
      setSubmitted(true);
    } catch {
      setError(t("delete-account.couldNotSubmitYourRequest"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F7FAF9",
        colorScheme: "only light",
        fontFamily: "'Inter', sans-serif",
        padding: "20px",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#fff",
          border: "1px solid #e2e8e6",
          borderRadius: 16,
          padding: "48px 40px",
          boxShadow: "0 18px 44px rgba(12,22,20,0.10)",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#0E5B54",
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
            {t("delete-account.deleteYourSimpulxAccount")}
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
            {t("delete-account.weReSorryToSee")}
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
                {t("delete-account.theFollowingDataWillBe")}
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
                <li>{t("delete-account.yourProfileAndAccountCredentials")}</li>
                <li>{t("delete-account.allConversationHistoryAndMessages")}</li>
                <li>{t("delete-account.contactsAndCustomerData")}</li>
                <li>{t("delete-account.campaignAndBroadcastHistory")}</li>
                <li>{t("delete-account.uploadedMediaAndFiles")}</li>
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
                {t("delete-account.emailAddressAssociatedWithYour")}
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
                {t("delete-account.reasonForLeavingOptional")}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={t("delete-account.tellUsWhyYouRe")}
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
              {t("delete-account.yourDeletionRequestWillBe")}{" "}
              <a href="mailto:support@simpulx.com" style={{ color: "#0E5B54" }}>
                support@simpulx.com
              </a>{" "}
              {t("delete-account.toCancelTheRequest")}
            </p>

            {error && (
              <p style={{ fontSize: 13, color: "#DC2626", margin: "0 0 12px", lineHeight: 1.5 }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                padding: "12px",
                background: submitting ? "#F87171" : "#DC2626",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? t("delete-account.submitting") : t("delete-account.requestAccountDeletion")}
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
              {t("delete-account.requestSubmitted")}
            </h2>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
              {t("delete-account.weVeReceivedYourDeletion")} <strong>{email}</strong>{t("delete-account.yourAccountAndDataWill")}
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
            © {new Date().getFullYear()} {t("delete-account.simpulxAllRightsReserved")}{" "}
            <a href="https://simpulx.com/privacy.html" style={{ color: "#0E5B54" }}>
              {t("delete-account.privacyPolicy")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
