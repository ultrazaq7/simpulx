"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography, Alert, CircularProgress, InputAdornment, IconButton } from "@mui/material";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { api, setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("agent1@demo.id");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      setSession(token, user);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <Box sx={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #0a1f1d 0%, #122c28 30%, #1a3d35 60%, #0f2420 100%)",
      position: "relative", overflow: "hidden",
    }}>

      {/* Logo */}
      <Box sx={{ mb: 3, position: "relative", zIndex: 1 }}>
        <Box sx={{
          width: 80, height: 80, borderRadius: "8px", mx: "auto", mb: 2,
          overflow: "hidden",
        }}>
          <img src="/simpulx_logo.png" alt="Simpulx" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </Box>
        <Typography sx={{
          fontSize: 32, fontWeight: 800, textAlign: "center", letterSpacing: "-0.02em",
          color: "#fff",
        }}>
          Simpul<span style={{ color: "#F5A623" }}>x</span>
        </Typography>
        <Typography sx={{ fontSize: 15, color: "rgba(255,255,255,0.5)", textAlign: "center", mt: 0.5 }}>
          Sign in to your account
        </Typography>
      </Box>

      {/* Login Card */}
      <Box sx={{
        width: "100%", maxWidth: 400, px: 4, position: "relative", zIndex: 1,
      }}>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: "8px" }}>{error}</Alert>}

        <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Email */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", mb: 1 }}>Email</Typography>
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
          </Box>

          {/* Password */}
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>Password</Typography>
              <Typography onClick={() => router.push("/forgot-password")} sx={{ fontSize: 12, color: "#2D8B73", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                Forgot password?
              </Typography>
            </Box>
            <TextField
              type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              fullWidth required placeholder="Password"
              slotProps={{ input: {
                startAdornment: <InputAdornment position="start"><LockOutlinedIcon sx={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }} /></InputAdornment>,
                endAdornment: <InputAdornment position="end">
                  <IconButton onClick={() => setShowPw(!showPw)} edge="end" size="small" sx={{ color: "rgba(255,255,255,0.3)" }}>
                    {showPw ? <VisibilityOutlinedIcon sx={{ fontSize: 18 }} /> : <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </InputAdornment>,
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
          </Box>

          {/* Sign In Button */}
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}
            sx={{
              mt: 1, py: 1.5, fontWeight: 700, fontSize: 15, borderRadius: "8px",
              background: "linear-gradient(135deg, #2D8B73 0%, #3AA88D 100%)",
              boxShadow: "0 4px 16px rgba(45,139,115,0.3)",
              "&:hover": { background: "linear-gradient(135deg, #257a65 0%, #2D8B73 100%)", boxShadow: "0 6px 20px rgba(45,139,115,0.4)" },
            }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : "Sign In"}
          </Button>
        </Box>

        {/* Footer */}
        <Typography sx={{ textAlign: "center", mt: 5, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
          &copy; 2026 Simpulx. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}
