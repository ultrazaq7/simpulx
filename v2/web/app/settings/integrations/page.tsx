"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, Button, IconButton, Switch, Tooltip, TextField, Select, MenuItem,
  Skeleton, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Divider, FormControl, InputLabel,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import { api } from "@/lib/api";
import type { WebApiSource, Department } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function IntegrationsPage() {
  const [rows, setRows] = useState<WebApiSource[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; editing: WebApiSource | null }>({ open: false, editing: null });
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([api.listWebApiSources(), api.listDepartments().catch(() => [])]);
      setRows(p); setDepts(d as Department[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function copy(text: string, label = "Copied") { navigator.clipboard.writeText(text); setToast({ msg: label, sev: "success" }); }
  async function toggle(p: WebApiSource) {
    try { await api.updateWebApiSource(p.id, { is_active: !p.is_active }); load(); } catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  async function regen(p: WebApiSource) {
    if (!confirm(`Regenerate the API key for "${p.name}"? The current key stops working.`)) return;
    try { const r = await api.regenerateWebApiKey(p.id); setToast({ msg: "API key regenerated", sev: "success" }); copy(r.api_key, "New key copied"); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  async function remove(p: WebApiSource) {
    if (!confirm(`Delete API source "${p.name}"?`)) return;
    try { await api.deleteWebApiSource(p.id); setToast({ msg: "API source deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  return (
    <Box sx={{ px: 3, pt: 3, pb: 3, maxWidth: 1000, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{rows.length} API source{rows.length === 1 ? "" : "s"}</Typography>
          <IconButton size="small" onClick={load}><RefreshRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDlg({ open: true, editing: null })}>Add API source</Button>
        </Box>

        {/* How it works */}
        <Box sx={{ p: 2.5, mb: 3, borderRadius: "8px", bgcolor: "action.hover", border: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Capture leads via API</Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1.5 }}>
            Send leads from ad platforms or external systems with the integration&apos;s API key. Each lead opens a conversation in the inbox, attributed to its source.
          </Typography>
          <Box sx={{ position: "relative", bgcolor: "#0d1b16", color: "#D1FAE5", borderRadius: "8px", p: 1.5, fontFamily: "monospace", fontSize: 11.5, overflowX: "auto" }}>
            <IconButton size="small" onClick={() => copy(`curl -X POST ${API}/v1/leads -H "X-API-Key: <KEY>" -H "Content-Type: application/json" -d '{"phone":"+62812...","name":"Lead","message":"Interested in a Brio"}'`)}
              sx={{ position: "absolute", top: 4, right: 4, color: "rgba(255,255,255,0.6)" }}><ContentCopyRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
            <Box component="pre" sx={{ m: 0, whiteSpace: "pre-wrap" }}>{`POST ${API}/v1/leads
X-API-Key: <your integration key>
{ "phone": "+62812...", "name": "Lead name", "message": "Interested in a Brio" }`}</Box>
          </Box>
        </Box>

        {/* List */}
        {loading ? (
          [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={96} sx={{ mb: 1.5, borderRadius: "8px" }} />)
        ) : rows.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8, border: "1px dashed", borderColor: "divider", borderRadius: "8px" }}>
            <HubOutlinedIcon sx={{ fontSize: 44, color: "text.disabled", mb: 1 }} />
            <Typography sx={{ fontWeight: 700 }}>No API sources yet</Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2 }}>Connect an ad platform or external system to capture leads via the Web API.</Typography>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDlg({ open: true, editing: null })}>Add API source</Button>
          </Box>
        ) : rows.map((p) => (
          <Box key={p.id} sx={{ p: 2.5, mb: 1.5, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", opacity: p.is_active ? 1 : 0.65 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "rgba(139,92,246,0.12)", color: "#8B5CF6" }}><HubOutlinedIcon /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>{p.name}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  {p.slug ? `slug: ${p.slug}` : ""}{p.department ? ` · ${p.department}` : ""} · {p.lead_count} leads
                </Typography>
              </Box>
              <Tooltip title={p.is_active ? "Active" : "Disabled"}><Switch size="small" checked={p.is_active} onChange={() => toggle(p)} /></Tooltip>
              <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg({ open: true, editing: p })}><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
              <Tooltip title="Delete"><IconButton size="small" sx={{ color: "error.main" }} onClick={() => remove(p)}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5, px: 1.25, py: 0.75, borderRadius: "8px", bgcolor: "action.hover" }}>
              <KeyRoundedIcon sx={{ fontSize: 15, color: "text.secondary" }} />
              <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary", flex: 1 }} noWrap>
                {p.api_key.slice(0, 10)}{"•".repeat(18)}
              </Typography>
              <Tooltip title="Copy key"><IconButton size="small" onClick={() => copy(p.api_key, "API key copied")}><ContentCopyRoundedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
              <Tooltip title="Regenerate key"><IconButton size="small" onClick={() => regen(p)}><AutorenewRoundedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
            </Box>
          </Box>
        ))}

      <WebApiDialog state={dlg} depts={depts}
        onClose={() => setDlg({ open: false, editing: null })}
        onSaved={(m) => { setDlg({ open: false, editing: null }); setToast({ msg: m, sev: "success" }); load(); }}
        onError={(m) => setToast({ msg: m, sev: "error" })} />
      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function WebApiDialog({ state, depts, onClose, onSaved, onError }: {
  state: { open: boolean; editing: WebApiSource | null }; depts: Department[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!state.editing;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [deptId, setDeptId] = useState("");
  const [template, setTemplate] = useState("");
  const [webhook, setWebhook] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const p = state.editing;
    setName(p?.name ?? ""); setSlug(p?.slug ?? ""); setDeptId(p?.auto_assign_dept_id ?? "");
    setTemplate(p?.auto_template_name ?? ""); setWebhook(p?.webhook_url ?? "");
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!name.trim()) { onError("Name is required"); return; }
    setSaving(true);
    const payload = { name: name.trim(), slug: slug.trim() || undefined, auto_assign_dept_id: deptId || undefined, auto_template_name: template.trim() || undefined, webhook_url: webhook.trim() || undefined };
    try {
      if (isEdit) { await api.updateWebApiSource(state.editing!.id, payload); onSaved("API source updated"); }
      else { await api.createWebApiSource(payload); onSaved("API source created"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={state.open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? "Edit API source" : "New API source"}</DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2.5 }}>
        <TextField label="Name" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Meta Ads" />
        <TextField label="Slug (optional)" size="small" fullWidth value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-generated from name" />
        <FormControl fullWidth size="small">
          <InputLabel>Auto-assign department</InputLabel>
          <Select label="Auto-assign department" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
            <MenuItem value="">None</MenuItem>
            {depts.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Auto template (optional)" size="small" fullWidth value={template} onChange={(e) => setTemplate(e.target.value)} />
        <TextField label="Webhook URL (optional)" size="small" fullWidth value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://..." />
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{isEdit ? "Save" : "Create"}</Button>
      </DialogActions>
    </Dialog>
  );
}
