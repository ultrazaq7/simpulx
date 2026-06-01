"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, TextField, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, IconButton, Select, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, ToggleButtonGroup, ToggleButton,
  Radio, RadioGroup, FormControlLabel, Snackbar, Alert,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { Broadcast, Template } from "@/lib/types";

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  completed: { bg: "#DCFCE7", fg: "#15803D" },
  sending: { bg: "#DBEAFE", fg: "#1D4ED8" },
  queued: { bg: "#E0F2FE", fg: "#0369A1" },
  scheduled: { bg: "#FEF3C7", fg: "#B45309" },
  draft: { bg: "#F1F5F9", fg: "#64748B" },
  failed: { bg: "#FEE2E2", fg: "#B91C1C" },
};

export default function BroadcastsPage() {
  const [rows, setRows] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await api.listBroadcasts()); } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <Shell>
      <Box sx={{ px: 2, pt: 2, pb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{rows.length} broadcast{rows.length === 1 ? "" : "s"}</Typography>
          <IconButton size="small" onClick={load}><RefreshRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>New broadcast</Button>
        </Box>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ "& th": { bgcolor: "#FAFBFC" } }}>
                  <TableCell>Broadcast</TableCell>
                  <TableCell>Template</TableCell>
                  <TableCell>Recipients</TableCell>
                  <TableCell>Delivered</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Send at</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}><CircularProgress size={22} /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography sx={{ fontWeight: 600 }}>No campaigns yet</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>Create a broadcast to message your contacts at scale.</Typography>
                  </TableCell></TableRow>
                ) : rows.map((b) => {
                  const sc = STATUS_COLOR[b.status] ?? STATUS_COLOR.draft;
                  return (
                    <TableRow key={b.id} hover>
                      <TableCell><Typography sx={{ fontWeight: 600, fontSize: 13 }}>{b.name}</Typography></TableCell>
                      <TableCell>{b.template_name ? <Chip size="small" label={b.template_name} variant="outlined" /> : <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>Free text</Typography>}</TableCell>
                      <TableCell>{b.total_recipients}</TableCell>
                      <TableCell>{b.sent_count}</TableCell>
                      <TableCell><Chip size="small" label={b.status} sx={{ fontWeight: 700, fontSize: 10, textTransform: "capitalize", bgcolor: sc.bg, color: sc.fg }} /></TableCell>
                      <TableCell><Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{fmtDate(b.created_at)}</Typography></TableCell>
                      <TableCell><Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{b.scheduled_at ? fmtDate(b.scheduled_at) : b.status === "completed" ? "Sent" : "Now"}</Typography></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>

      <NewBroadcastDialog open={open} onClose={() => setOpen(false)}
        onDone={(msg) => { setOpen(false); setToast({ msg, sev: "success" }); load(); }}
        onError={(msg) => setToast({ msg, sev: "error" })} />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Shell>
  );
}

function NewBroadcastDialog({ open, onClose, onDone, onError }: {
  open: boolean; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"template" | "text">("text");
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(""); setMode("text"); setTemplateId(""); setBody(""); setWhen("now"); setScheduledAt("");
    api.listTemplates().then((t) => setTemplates(t.filter((x) => x.status === "APPROVED"))).catch(() => {});
  }, [open]);

  const chosen = templates.find((t) => t.id === templateId);

  async function send() {
    if (!name.trim()) { onError("Campaign name is required"); return; }
    if (mode === "template" && !templateId) { onError("Choose a template"); return; }
    if (mode === "text" && !body.trim()) { onError("Message body is required"); return; }
    if (when === "later" && !scheduledAt) { onError("Pick a schedule time"); return; }
    setSending(true);
    try {
      const r = await api.createBroadcast({
        name: name.trim(),
        body: mode === "text" ? body.trim() : undefined,
        template_id: mode === "template" ? templateId : undefined,
        scheduled_at: when === "later" ? new Date(scheduledAt).toISOString() : undefined,
        audience: "all",
      });
      onDone(r.status === "scheduled" ? "Broadcast scheduled" : `Broadcast queued to ${r.total_recipients} recipients`);
    } catch (e) { onError(String(e)); }
    finally { setSending(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>New broadcast</DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2.5 }}>
        <Field label="Broadcast name"><TextField fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. October promo" autoFocus /></Field>
        <Field label="Message">
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} sx={{ mb: 1 }}>
            <ToggleButton value="text" sx={{ textTransform: "none" }}>Free text</ToggleButton>
            <ToggleButton value="template" sx={{ textTransform: "none" }}>WhatsApp template</ToggleButton>
          </ToggleButtonGroup>
          {mode === "text" ? (
            <TextField fullWidth multiline minRows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message..." />
          ) : (
            <>
              <Select fullWidth size="small" value={templateId} displayEmpty onChange={(e) => setTemplateId(e.target.value)}>
                <MenuItem value="" disabled>Select an approved template</MenuItem>
                {templates.length === 0 && <MenuItem value="" disabled>No approved templates — create one first</MenuItem>}
                {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name} ({t.language})</MenuItem>)}
              </Select>
              {chosen && (
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: "8px", bgcolor: "action.hover" }}>
                  {chosen.header_type === "TEXT" && chosen.header_text && <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{chosen.header_text}</Typography>}
                  <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{chosen.body}</Typography>
                  {chosen.footer && <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 0.5 }}>{chosen.footer}</Typography>}
                </Box>
              )}
            </>
          )}
        </Field>
        <Field label="Audience">
          <Select fullWidth size="small" value="all" disabled><MenuItem value="all">All contacts with a phone number</MenuItem></Select>
        </Field>
        <Field label="Schedule">
          <RadioGroup row value={when} onChange={(e) => setWhen(e.target.value as "now" | "later")}>
            <FormControlLabel value="now" control={<Radio size="small" />} label="Send now" />
            <FormControlLabel value="later" control={<Radio size="small" />} label="Schedule" />
          </RadioGroup>
          {when === "later" && (
            <TextField type="datetime-local" size="small" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} sx={{ mt: 0.5 }} />
          )}
        </Field>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={send} disabled={sending}>{sending ? <CircularProgress size={18} color="inherit" /> : when === "later" ? "Schedule" : "Send"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>{label}</Typography>
      {children}
    </Box>
  );
}
