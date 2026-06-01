"use client";
import { Box, Typography, Button, Paper, Alert } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import Shell from "@/components/Shell";
import { getToken } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ExportPage() {
  const token = getToken();

  const handleExport = (type: "campaigns" | "chats") => {
    // Generate a temporary link to download the CSV directly from the backend
    const url = `${API}/api/export/${type}?token=${token}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Shell>
      <Box sx={{ p: 2, maxWidth: 800, mx: "auto" }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Export Data</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 4 }}>
          Download historical data in CSV format for offline reporting and analytics.
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 16, mb: 0.5 }}>Campaign History</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 500 }}>
                Export campaign performance data including leads generated, messages sent, engagement metrics, and conversion rates for all campaigns.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<DownloadRoundedIcon />}
              onClick={() => handleExport("campaigns")}
              sx={{ fontWeight: 600, textTransform: "none", borderRadius: "8px" }}
            >
              Export CSV
            </Button>
          </Paper>

          <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 16, mb: 0.5 }}>Chat History & SLA Metrics</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 500 }}>
                Export detailed chat records including SLA tracking (response times), follow-up activity, pipeline stages, lead qualifications, and call attempts.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<DownloadRoundedIcon />}
              onClick={() => handleExport("chats")}
              sx={{ fontWeight: 600, textTransform: "none", borderRadius: "8px" }}
            >
              Export CSV
            </Button>
          </Paper>
        </Box>
      </Box>
    </Shell>
  );
}
