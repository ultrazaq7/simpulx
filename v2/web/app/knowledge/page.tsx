"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, TextField, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Card, CardContent, CircularProgress, IconButton,
  Select, MenuItem, Checkbox,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import KeyboardDoubleArrowLeftRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftRounded";
import KeyboardDoubleArrowRightRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowRightRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { KnowledgeSource } from "@/lib/types";

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { api.listKnowledge().then(setSources).catch(() => {}); }, []);

  async function add() {
    if (!title.trim() || !content.trim()) return;
    setSending(true);
    try { await api.addKnowledge(title.trim(), content.trim()); setTitle(""); setContent(""); setShowForm(false); setSources(await api.listKnowledge()); }
    catch {} finally { setSending(false); }
  }

  const statusColor: Record<string, { bg: string; fg: string }> = {
    ready: { bg: "#E8F5E9", fg: "#2E7D32" }, processing: { bg: "#E3F2FD", fg: "#2D8B73" },
    error: { bg: "#FFEBEE", fg: "#C62828" },
  };

  return (
    <Shell>
      <Box sx={{ px: 2, pt: 2, pb: 3 }}>
        {/* Toolbar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <Button variant="outlined" size="small" startIcon={<FilterListRoundedIcon sx={{ fontSize: 16 }} />} sx={{ textTransform: "none" }}>Filter</Button>
          <Button variant="outlined" size="small" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />} sx={{ textTransform: "none" }}>Export</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowForm(!showForm)} sx={{ textTransform: "none" }}>
            Add Source
          </Button>
        </Box>

        {showForm && (
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Add knowledge source</Typography>
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth size="small" />
              <TextField label="Content" value={content} onChange={(e) => setContent(e.target.value)} fullWidth multiline rows={4} size="small"
                placeholder="Paste FAQ, product info, policies, or anything your AI agent should know"
              />
              <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
                <Button variant="outlined" onClick={() => setShowForm(false)} sx={{ textTransform: "none" }}>Cancel</Button>
                <Button variant="contained" onClick={add} disabled={sending || !title.trim() || !content.trim()} sx={{ textTransform: "none" }}>
                  {sending ? <CircularProgress size={20} color="inherit" /> : "Add source"}
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ "& th": { fontWeight: 600, fontSize: 12, color: "text.secondary", py: 1.25, borderBottom: "1px solid", borderColor: "divider", bgcolor: "#FAFBFC" } }}>
                  <TableCell padding="checkbox" sx={{ width: 40 }}><Checkbox size="small" /></TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>Title <SwapVertRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} /></Box>
                  </TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Chunks</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>Created <SwapVertRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} /></Box>
                  </TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Typography sx={{ fontWeight: 600, color: "text.primary", mb: 0.5 }}>No data found</Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>No knowledge sources available at the moment.</Typography>
                    </TableCell>
                  </TableRow>
                ) : sources.map((s) => {
                  const sc = statusColor[s.status] || statusColor.processing;
                  return (
                    <TableRow key={s.id} hover sx={{ "&:hover": { bgcolor: "#FAFBFC" } }}>
                      <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                      <TableCell><Typography sx={{ fontWeight: 500, fontSize: 13 }}>{s.title}</Typography></TableCell>
                      <TableCell><Chip label={s.source_type} size="small" sx={{ textTransform: "capitalize", fontWeight: 600, fontSize: 11 }} /></TableCell>
                      <TableCell align="right">{s.chunks}</TableCell>
                      <TableCell><Chip label={s.status} size="small" sx={{ fontWeight: 600, fontSize: 11, bgcolor: sc.bg, color: sc.fg, textTransform: "capitalize" }} /></TableCell>
                      <TableCell><Typography variant="body2" sx={{ color: "text.secondary" }}>{fmtDate(s.created_at)}</Typography></TableCell>
                      <TableCell><Typography variant="body2" color="text.disabled">-</Typography></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Pagination */}
        <Box sx={{ display: "flex", alignItems: "center", py: 1.5, px: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>Total Data: {sources.length}</Typography>
          <Box sx={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 0.5 }}>
            <IconButton size="small" disabled><KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
            <IconButton size="small" disabled><ChevronLeftRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
            <Box sx={{ px: 1.5, py: 0.5, borderRadius: "8px", border: "1px solid", borderColor: "primary.main", color: "primary.main", fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: "center" }}>1</Box>
            <IconButton size="small" disabled><ChevronRightRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
            <IconButton size="small" disabled><KeyboardDoubleArrowRightRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>Show per Page:</Typography>
            <Select size="small" value={100} sx={{ fontSize: 13, borderRadius: "8px", minWidth: 100, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(0,0,0,0.15)" } }}>
              <MenuItem value={100}>100 rows</MenuItem>
            </Select>
          </Box>
        </Box>
      </Box>
    </Shell>
  );
}
