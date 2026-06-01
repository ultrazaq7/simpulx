"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, Button, IconButton, Switch, Tooltip, Chip, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, Snackbar, Alert, Divider,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ScheduleSendOutlinedIcon from "@mui/icons-material/ScheduleSendOutlined";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import type { Sequence, SequenceStep, Campaign } from "@/lib/types";

type UIStep = { value: number; unit: number; body: string }; // unit = minutes multiplier
const UNITS = [{ label: "minutes", m: 1 }, { label: "hours", m: 60 }, { label: "days", m: 1440 }];

function toUI(s: SequenceStep): UIStep {
  const mins = s.delay_minutes || 60;
  if (mins % 1440 === 0) return { value: mins / 1440, unit: 1440, body: s.body };
  if (mins % 60 === 0) return { value: mins / 60, unit: 60, body: s.body };
  return { value: mins, unit: 1, body: s.body };
}

export default function SequencesPage() {
  const [rows, setRows] = useState<Sequence[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([api.listSequences(), api.listCampaigns().catch(() => [])]);
      setRows(s); setCampaigns(c as Campaign[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggle(s: Sequence) {
    try { await api.updateSequence(s.id, { is_active: !s.is_active }); load(); } catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  async function remove(s: Sequence) {
    if (!confirm(`Delete sequence "${s.name}"? Active enrollments stop.`)) return;
    try { await api.deleteSequence(s.id); setToast({ msg: "Sequence deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  return (
    <Shell>
      <Box sx={{ px: 2, pt: 2, pb: 3, maxWidth: 980, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{rows.length} sequence{rows.length === 1 ? "" : "s"}</Typography>
          <IconButton size="small" onClick={load}><RefreshRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDlg({ open: true, id: null })}>New sequence</Button>
        </Box>

        <Box sx={{ p: 2, mb: 3, borderRadius: "8px", bgcolor: "action.hover" }}>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            Sequences auto-send timed follow-up messages to enrolled conversations. <b>No-reply</b> sequences stop as soon as the customer replies.
          </Typography>
        </Box>

        {loading ? (
          [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={88} sx={{ mb: 1.5, borderRadius: "8px" }} />)
        ) : rows.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 9, border: "1px dashed", borderColor: "divider", borderRadius: "8px" }}>
            <ScheduleSendOutlinedIcon sx={{ fontSize: 46, color: "text.disabled", mb: 1 }} />
            <Typography sx={{ fontWeight: 700 }}>No sequences yet</Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2 }}>Create a follow-up sequence to re-engage quiet leads automatically.</Typography>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDlg({ open: true, id: null })}>New sequence</Button>
          </Box>
        ) : rows.map((s) => (
          <Box key={s.id} sx={{ display: "flex", alignItems: "center", gap: 2, p: 2.5, mb: 1.5, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", opacity: s.is_active ? 1 : 0.65 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "action.selected", color: "primary.main" }}><ScheduleSendOutlinedIcon /></Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{s.name}</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {s.steps} step{s.steps === 1 ? "" : "s"} · {s.active_enrollments} active{s.campaign_name ? ` · ${s.campaign_name}` : " · all campaigns"}
              </Typography>
            </Box>
            <Chip size="small" label={s.trigger === "no_reply" ? "No reply" : "New lead"} sx={{ fontWeight: 700, fontSize: 10, bgcolor: "rgba(37,99,235,0.1)", color: "#2563EB" }} />
            <Tooltip title={s.is_active ? "Active" : "Paused"}><Switch size="small" checked={s.is_active} onChange={() => toggle(s)} /></Tooltip>
            <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg({ open: true, id: s.id })}><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton size="small" sx={{ color: "error.main" }} onClick={() => remove(s)}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
          </Box>
        ))}
      </Box>

      <SequenceDialog dlg={dlg} campaigns={campaigns}
        onClose={() => setDlg({ open: false, id: null })}
        onSaved={(m) => { setDlg({ open: false, id: null }); setToast({ msg: m, sev: "success" }); load(); }}
        onError={(m) => setToast({ msg: m, sev: "error" })} />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Shell>
  );
}

function SequenceDialog({ dlg, campaigns, onClose, onSaved, onError }: {
  dlg: { open: boolean; id: string | null }; campaigns: Campaign[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!dlg.id;
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("no_reply");
  const [campaignId, setCampaignId] = useState("");
  const [steps, setSteps] = useState<UIStep[]>([{ value: 1, unit: 60, body: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dlg.open) return;
    if (dlg.id) {
      api.getSequence(dlg.id).then((s) => {
        setName(s.name); setTrigger(s.trigger); setCampaignId(s.campaign_id ?? "");
        setSteps(s.steps.length ? s.steps.map(toUI) : [{ value: 1, unit: 60, body: "" }]);
      }).catch((e) => onError(String(e)));
    } else {
      setName(""); setTrigger("no_reply"); setCampaignId(""); setSteps([{ value: 1, unit: 60, body: "" }]);
    }
  }, [dlg.open, dlg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setStep(i: number, patch: Partial<UIStep>) { setSteps((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x))); }
  function addStep() { setSteps((s) => [...s, { value: 1, unit: 1440, body: "" }]); }
  function removeStep(i: number) { setSteps((s) => s.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!name.trim()) { onError("Sequence name is required"); return; }
    const outSteps: SequenceStep[] = steps.filter((s) => s.body.trim()).map((s) => ({ delay_minutes: Math.max(1, Math.round(s.value)) * s.unit, body: s.body.trim() }));
    if (outSteps.length === 0) { onError("Add at least one step with a message"); return; }
    setSaving(true);
    const payload = { name: name.trim(), trigger, campaign_id: campaignId || undefined, steps: outSteps };
    try {
      if (isEdit) { await api.updateSequence(dlg.id!, payload); onSaved("Sequence updated"); }
      else { await api.createSequence(payload); onSaved("Sequence created"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={dlg.open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? "Edit sequence" : "New sequence"}</DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2.5 }}>
        <Field label="Name"><TextField fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. No-reply follow-up" autoFocus /></Field>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Field label="Trigger" sx={{ flex: 1 }}>
            <Select fullWidth size="small" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              <MenuItem value="no_reply">No reply (stops on reply)</MenuItem>
              <MenuItem value="new_lead">New lead</MenuItem>
            </Select>
          </Field>
          <Field label="Campaign" sx={{ flex: 1 }}>
            <FormControl fullWidth size="small">
              <Select value={campaignId} displayEmpty onChange={(e) => setCampaignId(e.target.value)}>
                <MenuItem value="">All campaigns</MenuItem>
                {campaigns.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Field>
        </Box>
        <Divider textAlign="left" sx={{ fontSize: 11, color: "text.secondary" }}>STEPS</Divider>
        {steps.map((st, i) => (
          <Box key={i} sx={{ p: 1.5, borderRadius: "8px", border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>Step {i + 1} · after</Typography>
              <TextField size="small" type="number" value={st.value} onChange={(e) => setStep(i, { value: Number(e.target.value) })} sx={{ width: 80 }} />
              <Select size="small" value={st.unit} onChange={(e) => setStep(i, { unit: Number(e.target.value) })} sx={{ width: 110 }}>
                {UNITS.map((u) => <MenuItem key={u.m} value={u.m}>{u.label}</MenuItem>)}
              </Select>
              <Box sx={{ flex: 1 }} />
              {steps.length > 1 && <IconButton size="small" sx={{ color: "error.main" }} onClick={() => removeStep(i)}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton>}
            </Box>
            <TextField fullWidth size="small" multiline minRows={2} value={st.body} onChange={(e) => setStep(i, { body: e.target.value })} placeholder="Follow-up message..." />
          </Box>
        ))}
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={addStep} sx={{ alignSelf: "flex-start" }}>Add step</Button>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{isEdit ? "Save" : "Create"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function Field({ label, children, sx }: { label: string; children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={sx}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>{label}</Typography>
      {children}
    </Box>
  );
}
