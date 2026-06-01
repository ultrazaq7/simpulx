"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, TextField, Button, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Card, CardContent, IconButton,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { KnowledgeSource } from "@/lib/types";
import { useToast, PageBody, PageHeader } from "../_shared";

const statusColor: Record<string, { bg: string; fg: string }> = {
  ready: { bg: "#E8F5E9", fg: "#2E7D32" },
  processing: { bg: "#E3F2FD", fg: "#2D8B73" },
  error: { bg: "#FFEBEE", fg: "#C62828" },
};

export default function KnowledgeSettingsPage() {
  const { notify, ToastHost } = useToast();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [kTitle, setKTitle] = useState("");
  const [kContent, setKContent] = useState("");
  const [kSending, setKSending] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { api.listKnowledge().then(setSources).catch(() => {}); }, []);

  async function addKnowledge() {
    if (!kTitle.trim() || !kContent.trim()) return;
    setKSending(true);
    try {
      await api.addKnowledge(kTitle.trim(), kContent.trim());
      setKTitle(""); setKContent(""); setShowForm(false);
      setSources(await api.listKnowledge());
      notify("Knowledge source added!");
    } catch { notify("Failed to add", "error"); }
    finally { setKSending(false); }
  }
  async function deleteKnowledge(id: string) {
    try { await api.deleteKnowledge(id); setSources(await api.listKnowledge()); notify("Source deleted", "info"); }
    catch { notify("Failed to delete", "error"); }
  }

  return (
    <PageBody>
      {ToastHost}
      <PageHeader
        left={<Typography sx={{ fontSize: 13, color: "text.secondary" }}>{sources.length} source{sources.length === 1 ? "" : "s"}</Typography>}
        right={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowForm(!showForm)} sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600 }}>Add Source</Button>}
      />

      {showForm && (
        <Card sx={{ mb: 3, border: "1px solid", borderColor: "divider" }}>
          <CardContent sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Add knowledge source</Typography>
            <TextField label="Title" value={kTitle} onChange={(e) => setKTitle(e.target.value)} fullWidth size="small" />
            <TextField label="Content" value={kContent} onChange={(e) => setKContent(e.target.value)} fullWidth multiline rows={4} size="small"
              placeholder="Paste FAQ, product info, policies, or anything your AI agent should know" />
            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
              <Button variant="outlined" onClick={() => setShowForm(false)} sx={{ textTransform: "none", borderRadius: "8px" }}>Cancel</Button>
              <Button variant="contained" onClick={addKnowledge} disabled={kSending || !kTitle.trim() || !kContent.trim()} sx={{ textTransform: "none", borderRadius: "8px" }}>
                {kSending ? <CircularProgress size={20} color="inherit" /> : "Add source"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 600, fontSize: 12, color: "text.secondary", py: 1.25, borderBottom: "1px solid", borderColor: "divider", bgcolor: "#FAFBFC" } }}>
                <TableCell>Title</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Chunks</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography sx={{ fontWeight: 600, color: "text.primary", mb: 0.5 }}>No knowledge sources</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>Add your first knowledge source to help your AI agent.</Typography>
                  </TableCell>
                </TableRow>
              ) : sources.map((s) => {
                const sc = statusColor[s.status] || statusColor.processing;
                return (
                  <TableRow key={s.id} hover sx={{ "&:hover": { bgcolor: "#FAFBFC" } }}>
                    <TableCell><Typography sx={{ fontWeight: 500, fontSize: 13 }}>{s.title}</Typography></TableCell>
                    <TableCell><Chip label={s.source_type} size="small" sx={{ textTransform: "capitalize", fontWeight: 600, fontSize: 11 }} /></TableCell>
                    <TableCell align="right">{s.chunks}</TableCell>
                    <TableCell><Chip label={s.status} size="small" sx={{ fontWeight: 600, fontSize: 11, bgcolor: sc.bg, color: sc.fg, textTransform: "capitalize" }} /></TableCell>
                    <TableCell><Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>{fmtDate(s.created_at)}</Typography></TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => deleteKnowledge(s.id)} sx={{ color: "error.main" }}>
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider", display: "flex", alignItems: "center" }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>Total: {sources.length}</Typography>
        </Box>
      </Box>
    </PageBody>
  );
}
