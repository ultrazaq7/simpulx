"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography, Alert, CircularProgress, InputAdornment } from "@mui/material";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally { setLoading(false); }
  }

  return (
    <Box sx={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #0a1f1d 0%, #122c28 30%, #1a3d35 60%, #0f2420 100%)",
      position: "relative", overflow: "hidden", px: 2,
    }}>
      <Box sx={{ mb: 3, position: "relative", zIndex: 1 }}>
        <Box sx={{ width: 80, height: 80, borderRadius: "8px", mx: "auto", mb: 2, overflow: "hidden" }}>
          <img src="/simpulx_logo.png" alt="Simpulx" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </Box>
        <Typography sx={{ fontSize: 32, fontWeight: 800, textAlign: "center", letterSpacing: "-0.02em", color: "#fff" }}>
          Simpul<span style={{ color: "#F5A623" }}>x</span>
        </Typography>
      </Box>

      <Box sx={{ width: "100%", maxWidth: 400, px: 4, position: "relative", zIndex: 1 }}>
        {sent ? (
          <Box sx={{ textAlign: "center" }}>
            <Box sx={{ width: 72, height: 72, borderRadius: "20px", mx: "auto", mb: 3, display: "grid", placeItems: "center", bgcolor: "rgba(16,185,129,0.12)" }}>
              <MarkEmailReadRoundedIcon sx={{ fontSize: 34, color: "#10B981" }} />
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#fff", mb: 1 }}>Check your email</Typography>
            <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, mb: 4 }}>
              If an account exists for <b style={{ color: "rgba(255,255,255,0.75)" }}>{email}</b>, we have sent a link to reset your password.
            </Typography>
            <Button fullWidth variant="outlined" onClick={() => router.push("/login")}
              sx={{ py: 1.25, borderRadius: "8px", textTransform: "none", fontWeight: 600, color: "#fff", borderColor: "rgba(255,255,255,0.2)", "&:hover": { borderColor: "rgba(255,255,255,0.4)", bgcolor: "rgba(255,255,255,0.04)" } }}>
              Back to Sign In
            </Button>
          </Box>
        ) : (
          <>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "center", mb: 1 }}>Reset password</Typography>
            <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 1.6, mb: 3 }}>
              Enter your email and we will send you a link to reset your password.
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: "8px" }}>{error}</Alert>}
            <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                fullWidth required autoFocus placeholder="you@company.com"
                slotProps={{ input: {
                  startAdornment: <InputAdornment position="start"><EmailOutlinedIcon sx={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }} /></InputAdornment>,
                }}}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "rgba(255,255,255,0.06)", borderRadius: "8px",
                    "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
                    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
                    "&.Mui-focused fieldset": { borderColor: "#2D8B73" },
                  },
                  "& .MuiInputBase-input": { color: "#fff", fontSize: 14 },
                  "& .MuiInputBase-input::placeholder": { color: "rgba(255,255,255,0.3)", opacity: 1 },
                }}
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}
                sx={{
                  py: 1.5, fontWeight: 700, fontSize: 15, borderRadius: "8px",
                  background: "linear-gradient(135deg, #2D8B73 0%, #3AA88D 100%)",
                  boxShadow: "0 4px 16px rgba(45,139,115,0.3)",
                  "&:hover": { background: "linear-gradient(135deg, #257a65 0%, #2D8B73 100%)" },
                }}>
                {loading ? <CircularProgress size={22} color="inherit" /> : "Send Reset Link"}
              </Button>
            </Box>
            <Box onClick={() => router.push("/login")} sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, mt: 3, cursor: "pointer", color: "rgba(255,255,255,0.5)", "&:hover": { color: "rgba(255,255,255,0.8)" } }}>
              <ArrowBackRoundedIcon sx={{ fontSize: 16 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Back to Sign In</Typography>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
