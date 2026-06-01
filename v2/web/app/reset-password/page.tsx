"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography, Alert, CircularProgress, InputAdornment, IconButton } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Read the token from the URL on mount (avoids useSearchParams Suspense rule).
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.resetPassword(token || "", password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally { setLoading(false); }
  }

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      bgcolor: "rgba(255,255,255,0.06)", borderRadius: "8px",
      "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
      "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
      "&.Mui-focused fieldset": { borderColor: "#2D8B73" },
    },
    "& .MuiInputBase-input": { color: "#fff", fontSize: 14 },
    "& .MuiInputBase-input::placeholder": { color: "rgba(255,255,255,0.3)", opacity: 1 },
  };

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
        {done ? (
          <Box sx={{ textAlign: "center" }}>
            <Box sx={{ width: 72, height: 72, borderRadius: "20px", mx: "auto", mb: 3, display: "grid", placeItems: "center", bgcolor: "rgba(16,185,129,0.12)" }}>
              <CheckCircleRoundedIcon sx={{ fontSize: 34, color: "#10B981" }} />
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#fff", mb: 1 }}>Password reset</Typography>
            <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, mb: 4 }}>
              Your password has been updated. You can now sign in with your new password.
            </Typography>
            <Button fullWidth variant="contained" onClick={() => router.push("/login")}
              sx={{ py: 1.5, borderRadius: "8px", textTransform: "none", fontWeight: 700, fontSize: 15,
                background: "linear-gradient(135deg, #2D8B73 0%, #3AA88D 100%)",
                "&:hover": { background: "linear-gradient(135deg, #257a65 0%, #2D8B73 100%)" } }}>
              Go to Sign In
            </Button>
          </Box>
        ) : token === null ? (
          <Alert severity="error" sx={{ borderRadius: "8px" }}>
            This reset link is invalid or has expired. Please request a new one.
          </Alert>
        ) : (
          <>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "center", mb: 1 }}>Set a new password</Typography>
            <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 1.6, mb: 3 }}>
              Choose a new password for your account.
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: "8px" }}>{error}</Alert>}
            <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField
                type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                fullWidth required autoFocus placeholder="New password"
                slotProps={{ input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon sx={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }} /></InputAdornment>,
                  endAdornment: <InputAdornment position="end">
                    <IconButton onClick={() => setShowPw(!showPw)} edge="end" size="small" sx={{ color: "rgba(255,255,255,0.3)" }}>
                      {showPw ? <VisibilityOutlinedIcon sx={{ fontSize: 18 }} /> : <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </InputAdornment>,
                }}}
                sx={fieldSx}
              />
              <TextField
                type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                fullWidth required placeholder="Confirm new password"
                slotProps={{ input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon sx={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }} /></InputAdornment>,
                }}}
                sx={fieldSx}
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}
                sx={{
                  py: 1.5, fontWeight: 700, fontSize: 15, borderRadius: "8px",
                  background: "linear-gradient(135deg, #2D8B73 0%, #3AA88D 100%)",
                  boxShadow: "0 4px 16px rgba(45,139,115,0.3)",
                  "&:hover": { background: "linear-gradient(135deg, #257a65 0%, #2D8B73 100%)" },
                }}>
                {loading ? <CircularProgress size={22} color="inherit" /> : "Reset Password"}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
