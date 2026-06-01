"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, Button, IconButton, Tooltip, TextField, InputAdornment, Select, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, Chip, Skeleton, Dialog, DialogTitle,
  DialogContent, DialogActions, Snackbar, Alert, Divider,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { Template, TemplateButton } from "@/lib/types";

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F1F5F9", fg: "#64748B" },
  PENDING: { bg: "#FEF3C7", fg: "#B45309" },
  APPROVED: { bg: "#DCFCE7", fg: "#15803D" },
  REJECTED: { bg: "#FEE2E2", fg: "#B91C1C" },
};
const CAT_COLOR: Record<string, string> = { MARKETING: "#2563EB", UTILITY: "#0891B2", AUTHENTICATION: "#7C3AED" };
const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const LANGS = ["en", "id", "es", "pt_BR", "ar"];

function renderBody(body: string, vars: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] || `{{${n}}}`);
}

export default function TemplatesPage() {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await api.listTemplates()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((t) =>
    (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
    (!statusFilter || t.status === statusFilter)
  ), [rows, query, statusFilter]);

  async function submit(t: Template) {
    try { const r = await api.submitTemplate(t.id); setToast({ msg: r.simulated ? "Submitted — auto-approved (mock mode)" : "Submitted to Meta for review", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try { await api.deleteTemplate(t.id); setToast({ msg: "Template deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  return (
    <Box sx={{ px: 3, pt: 3, pb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5, flexWrap: "wrap" }}>
          <TextField size="small" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)}
            sx={{ width: 300, "& .MuiOutlinedInput-root": { bgcolor: "background.paper", borderRadius: "8px" } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} /></InputAdornment> } }} />
          <Select size="small" value={statusFilter} displayEmpty onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 150, bgcolor: "background.paper" }}>
            <MenuItem value="">All statuses</MenuItem>
            {Object.keys(STATUS_COLOR).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load}><RefreshRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { setEditing(null); setOpen(true); }}>New template</Button>
        </Box>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "#FAFBFC" } }}>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Language</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? [0, 1, 2].map((i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton height={28} /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Typography sx={{ fontWeight: 600 }}>No templates yet</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Create a WhatsApp template and submit it for approval.</Typography>
                </TableCell></TableRow>
              ) : filtered.map((t) => {
                const sc = STATUS_COLOR[t.status] ?? STATUS_COLOR.DRAFT;
                return (
                  <TableRow key={t.id} hover>
                    <TableCell><Typography sx={{ fontWeight: 600, fontSize: 13 }}>{t.name}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: "text.secondary" }} noWrap>{t.body.slice(0, 60)}{t.body.length > 60 ? "…" : ""}</Typography>
                    </TableCell>
                    <TableCell><Chip size="small" label={t.category} sx={{ fontWeight: 700, fontSize: 10, bgcolor: `${CAT_COLOR[t.category] ?? "#64748B"}1a`, color: CAT_COLOR[t.category] ?? "#64748B" }} /></TableCell>
                    <TableCell><Typography sx={{ fontSize: 12.5 }}>{t.language}</Typography></TableCell>
                    <TableCell><Chip size="small" label={t.status} sx={{ fontWeight: 700, fontSize: 10, bgcolor: sc.bg, color: sc.fg }} /></TableCell>
                    <TableCell><Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{fmtDate(t.updated_at)}</Typography></TableCell>
                    <TableCell align="right">
                      {(t.status === "DRAFT" || t.status === "REJECTED") && (
                        <Tooltip title="Submit to Meta"><IconButton size="small" color="primary" onClick={() => submit(t)}><SendRoundedIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
                      )}
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditing(t); setOpen(true); }}><EditOutlinedIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" sx={{ color: "error.main" }} onClick={() => remove(t)}><DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>

      <TemplateDialog open={open} editing={editing}
        onClose={() => setOpen(false)}
        onSaved={(msg) => { setOpen(false); setToast({ msg, sev: "success" }); load(); }}
        onError={(msg) => setToast({ msg, sev: "error" })} />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function TemplateDialog({ open, editing, onClose, onSaved, onError }: {
  open: boolean; editing: Template | null; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("en");
  const [headerType, setHeaderType] = useState("NONE");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = editing;
    setName(t?.name ?? ""); setCategory(t?.category ?? "MARKETING"); setLanguage(t?.language ?? "en");
    setHeaderType(t?.header_type ?? "NONE"); setHeaderText(t?.header_text ?? "");
    setBody(t?.body ?? ""); setFooter(t?.footer ?? "");
    setButtons(t?.buttons ?? []); setVariables(t?.variables ?? []);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep one sample value per {{n}} placeholder found in the body.
  const placeholderCount = useMemo(() => {
    const m = body.match(/\{\{(\d+)\}\}/g) ?? [];
    return m.reduce((max, p) => Math.max(max, Number(p.replace(/\D/g, ""))), 0);
  }, [body]);
  const vars = useMemo(() => Array.from({ length: placeholderCount }, (_, i) => variables[i] ?? ""), [placeholderCount, variables]);

  function setVar(i: number, v: string) { const next = [...vars]; next[i] = v; setVariables(next); }
  function addButton() { if (buttons.length < 3) setButtons([...buttons, { type: "QUICK_REPLY", text: "" }]); }
  function setButton(i: number, b: TemplateButton) { setButtons(buttons.map((x, idx) => (idx === i ? b : x))); }
  function removeButton(i: number) { setButtons(buttons.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!name.trim() || !body.trim()) { onError("Name and body are required"); return; }
    if (!/^[a-z0-9_]+$/.test(name.trim())) { onError("Name must be lowercase letters, numbers and underscores"); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), category, language, header_type: headerType,
      header_text: headerType === "TEXT" ? headerText : "",
      body, footer, buttons, variables: vars,
    };
    try {
      if (isEdit) { await api.updateTemplate(editing!.id, payload); onSaved("Template updated (back to draft)"); }
      else { await api.createTemplate(payload); onSaved("Template saved as draft"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? "Edit template" : "New WhatsApp template"}</DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", gap: 3, pt: 2.5 }}>
        {/* Form */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 2 }}>
            <L label="Name" sx={{ flex: 1 }}><TextField fullWidth value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="welcome_offer" disabled={isEdit} /></L>
            <L label="Language" sx={{ width: 110 }}><Select fullWidth size="small" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}</Select></L>
          </Box>
          <L label="Category"><Select fullWidth size="small" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></L>
          <Box sx={{ display: "flex", gap: 2 }}>
            <L label="Header" sx={{ width: 150 }}><Select fullWidth size="small" value={headerType} onChange={(e) => setHeaderType(e.target.value)}>{["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"].map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}</Select></L>
            {headerType === "TEXT" && <L label="Header text" sx={{ flex: 1 }}><TextField fullWidth value={headerText} onChange={(e) => setHeaderText(e.target.value)} /></L>}
          </Box>
          <L label="Body (use {{1}}, {{2}} for variables)">
            <TextField fullWidth multiline minRows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{1}}, thanks for joining!" />
          </L>
          {placeholderCount > 0 && (
            <L label="Sample values">
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {vars.map((v, i) => (
                  <TextField key={i} size="small" value={v} onChange={(e) => setVar(i, e.target.value)}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>{`{{${i + 1}}}`}</Typography></InputAdornment> } }} />
                ))}
              </Box>
            </L>
          )}
          <L label="Footer"><TextField fullWidth value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Reply STOP to opt out" /></L>
          <L label="Buttons">
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {buttons.map((b, i) => (
                <Box key={i} sx={{ display: "flex", gap: 1 }}>
                  <Select size="small" value={b.type} onChange={(e) => setButton(i, { ...b, type: e.target.value as TemplateButton["type"] })} sx={{ width: 150 }}>
                    <MenuItem value="QUICK_REPLY">Quick reply</MenuItem>
                    <MenuItem value="URL">Visit URL</MenuItem>
                    <MenuItem value="PHONE_NUMBER">Call phone</MenuItem>
                  </Select>
                  <TextField size="small" placeholder="Button text" value={b.text} onChange={(e) => setButton(i, { ...b, text: e.target.value })} sx={{ flex: 1 }} />
                  {b.type === "URL" && <TextField size="small" placeholder="https://..." value={b.url ?? ""} onChange={(e) => setButton(i, { ...b, url: e.target.value })} sx={{ flex: 1 }} />}
                  {b.type === "PHONE_NUMBER" && <TextField size="small" placeholder="+62..." value={b.phone ?? ""} onChange={(e) => setButton(i, { ...b, phone: e.target.value })} sx={{ flex: 1 }} />}
                  <IconButton size="small" sx={{ color: "error.main" }} onClick={() => removeButton(i)}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
                </Box>
              ))}
              {buttons.length < 3 && <Button size="small" startIcon={<AddRoundedIcon />} onClick={addButton} sx={{ alignSelf: "flex-start" }}>Add button</Button>}
            </Box>
          </L>
        </Box>

        {/* Live preview */}
        <Box sx={{ width: 300, flexShrink: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary", mb: 1 }}>PREVIEW</Typography>
          <Box sx={{ bgcolor: "#E5DDD5", borderRadius: "8px", p: 2, minHeight: 200,
            backgroundImage: "radial-gradient(rgba(0,0,0,0.04) 1px,transparent 1px)", backgroundSize: "16px 16px" }}>
            <Box sx={{ bgcolor: "#fff", borderRadius: "8px", borderTopLeftRadius: 0, p: 1.25, boxShadow: 1, maxWidth: 250 }}>
              {headerType === "TEXT" && headerText && <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>{headerText}</Typography>}
              {headerType !== "NONE" && headerType !== "TEXT" && (
                <Box sx={{ height: 96, borderRadius: "8px", bgcolor: "#D1D7DB", display: "grid", placeItems: "center", mb: 0.75, color: "#5A6B73", fontSize: 12 }}>{headerType}</Box>
              )}
              <Typography sx={{ fontSize: 13.5, whiteSpace: "pre-wrap", color: "#111B21" }}>{renderBody(body, vars) || "Your message body will appear here."}</Typography>
              {footer && <Typography sx={{ fontSize: 11, color: "#667781", mt: 0.75 }}>{footer}</Typography>}
              <Typography sx={{ fontSize: 10, color: "#8696A0", textAlign: "right", mt: 0.25 }}>12:30 PM</Typography>
            </Box>
            {buttons.length > 0 && (
              <Box sx={{ mt: 0.75, display: "flex", flexDirection: "column", gap: 0.5, maxWidth: 250 }}>
                {buttons.map((b, i) => (
                  <Box key={i} sx={{ bgcolor: "#fff", borderRadius: "8px", py: 0.75, textAlign: "center", color: "#1DA1F2", fontWeight: 600, fontSize: 13, boxShadow: 1 }}>
                    {b.text || "Button"}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{isEdit ? "Save draft" : "Create draft"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function L({ label, children, sx }: { label: string; children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={sx}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>{label}</Typography>
      {children}
    </Box>
  );
}
