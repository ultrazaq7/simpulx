"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Typography, Button, IconButton, Switch, Tooltip, TextField, InputAdornment,
  Select, MenuItem, Skeleton, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, Divider,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { TRIGGERS, ACTIONS, TRIGGER_KEYS, triggerLabel } from "@/lib/automationMeta";
import type { Automation, Channel } from "@/lib/types";

export default function AutomationPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Automation[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [triggerFilter, setTriggerFilter] = useState("");
  const [editing, setEditing] = useState<Automation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([api.listAutomations(), api.listChannels().catch(() => [])]);
      setRows(a); setChannels(c as Channel[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (!query || r.name.toLowerCase().includes(query.toLowerCase())) &&
    (!triggerFilter || r.trigger_type === triggerFilter)
  ), [rows, query, triggerFilter]);

  async function toggle(r: Automation) {
    try { await api.updateAutomation(r.id, { is_active: !r.is_active }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  async function remove(r: Automation) {
    if (!confirm(`Delete automation "${r.name}"?`)) return;
    try { await api.deleteAutomation(r.id); setToast({ msg: "Automation deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  function openNew() { setEditing(null); setDialogOpen(true); }
  function openEdit(r: Automation) { setEditing(r); setDialogOpen(true); }

  return (
    <Box sx={{ px: 3, pt: 3, pb: 3 }}>
        {/* Toolbar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5, flexWrap: "wrap" }}>
          <TextField size="small" placeholder="Search automations" value={query} onChange={(e) => setQuery(e.target.value)}
            sx={{ width: 300, "& .MuiOutlinedInput-root": { bgcolor: "background.paper", borderRadius: "8px" } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} /></InputAdornment> } }}
          />
          <Select size="small" value={triggerFilter} displayEmpty onChange={(e) => setTriggerFilter(e.target.value)}
            sx={{ minWidth: 180, bgcolor: "background.paper" }}>
            <MenuItem value="">All triggers</MenuItem>
            {TRIGGER_KEYS.map((k) => <MenuItem key={k} value={k}>{TRIGGERS[k].label}</MenuItem>)}
          </Select>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load}><RefreshRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openNew}>New automation</Button>
        </Box>

        {/* Grid */}
        {loading ? (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 2 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={184} sx={{ borderRadius: "8px" }} />)}
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 10 }}>
            <Box sx={{ width: 88, height: 88, borderRadius: "50%", bgcolor: "action.selected", display: "grid", placeItems: "center", mx: "auto", mb: 2.5 }}>
              <AutoFixHighRoundedIcon sx={{ fontSize: 44, color: "primary.main" }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{query || triggerFilter ? "No matching automations" : "No automations yet"}</Typography>
            <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 0.5, mb: 2.5 }}>
              Create your first automation to route messages and reply automatically.
            </Typography>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openNew}>New automation</Button>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 2 }}>
            {filtered.map((r) => (
              <Box key={r.id} onClick={() => router.push(`/settings/automation/${r.id}/flow`)}
                sx={{
                  p: 2.5, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider",
                  cursor: "pointer", display: "flex", flexDirection: "column", minHeight: 184,
                  transition: "box-shadow .15s, border-color .15s",
                  "&:hover": { boxShadow: 3, borderColor: "rgba(0,0,0,0.16)" },
                  opacity: r.is_active ? 1 : 0.68,
                }}>
                <Box sx={{ display: "flex", alignItems: "flex-start" }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: r.is_active ? "action.selected" : "action.hover", color: r.is_active ? "primary.main" : "text.disabled" }}>
                    <AccountTreeRoundedIcon />
                  </Box>
                  <Box sx={{ flex: 1 }} />
                  <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex", alignItems: "center" }}>
                    <Tooltip title={r.is_active ? "Active" : "Paused"}><Switch size="small" checked={r.is_active} onChange={() => toggle(r)} /></Tooltip>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(r)}><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" onClick={() => remove(r)} sx={{ color: "error.main" }}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  </Box>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: 15.5, mt: 1.5, lineHeight: 1.3 }} noWrap>{r.name}</Typography>
                {r.description && <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }} noWrap>{r.description}</Typography>}
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mt: 1.5, px: 1, py: 0.5, borderRadius: "8px", bgcolor: "action.hover", alignSelf: "flex-start" }}>
                  <BoltRoundedIcon sx={{ fontSize: 14, color: "warning.main" }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{triggerLabel(r.trigger_type)}</Typography>
                </Box>
                <Box sx={{ flex: 1 }} />
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
                  <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
                    {(r.actions?.length ?? 0)} action{(r.actions?.length ?? 0) === 1 ? "" : "s"} · {r.run_count} runs
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Typography sx={{ fontSize: 11.5, color: "primary.main", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                    Open flow <AccountTreeRoundedIcon sx={{ fontSize: 14 }} />
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}

      <EditDialog
        open={dialogOpen} editing={editing} channels={channels}
        onClose={() => setDialogOpen(false)}
        onSaved={(msg) => { setDialogOpen(false); setToast({ msg, sev: "success" }); load(); }}
        onError={(msg) => setToast({ msg, sev: "error" })}
      />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function EditDialog({ open, editing, channels, onClose, onSaved, onError }: {
  open: boolean; editing: Automation | null; channels: Channel[];
  onClose: () => void; onSaved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("new_message");
  const [channelId, setChannelId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [idleMinutes, setIdleMinutes] = useState("30");
  const [action, setAction] = useState("send_message");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = editing;
    setName(r?.name ?? "");
    setDescription(r?.description ?? "");
    setTrigger(r?.trigger_type ?? "new_message");
    setChannelId(r?.channel_id ?? "");
    const tc = (r?.trigger_config ?? {}) as Record<string, unknown>;
    setKeywords(Array.isArray(tc.keywords) ? (tc.keywords as string[]).join(", ") : "");
    setIdleMinutes(tc.idle_minutes ? String(tc.idle_minutes) : "30");
    const first = r?.actions?.[0];
    setAction(first?.type ?? "send_message");
    setMessage(String(first?.params?.message ?? first?.params?.template_name ?? ""));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsKeywords = trigger === "keyword_match";
  const needsIdle = trigger === "conversation_idle";
  const needsMessage = action === "send_message" || action === "send_template" || action === "webhook_notify";

  async function save() {
    if (!name.trim()) { onError("Automation name is required"); return; }
    setSaving(true);
    const triggerConfig: Record<string, unknown> = {};
    if (needsKeywords) triggerConfig.keywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (needsIdle) triggerConfig.idle_minutes = Number(idleMinutes) || 30;
    const params: Record<string, unknown> = {};
    if (action === "send_message") params.message = message;
    if (action === "send_template") params.template_name = message;
    if (action === "webhook_notify") params.url = message;
    const actions = [{ type: action, params }];
    try {
      if (isEdit) {
        await api.updateAutomation(editing!.id, {
          name: name.trim(), description, trigger_type: trigger,
          trigger_config: triggerConfig, channel_id: channelId, actions,
        });
        onSaved("Automation updated");
      } else {
        await api.createAutomation({
          name: name.trim(), description, trigger_type: trigger,
          trigger_config: triggerConfig, channel_id: channelId || undefined, actions,
        });
        onSaved("Automation created");
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? "Edit automation" : "New automation"}</DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2.5 }}>
        <Labeled label="Name"><TextField fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome new chats" autoFocus /></Labeled>
        <Labeled label="Description"><TextField fullWidth value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></Labeled>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Labeled label="Trigger" sx={{ flex: 1 }}>
            <Select fullWidth size="small" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {TRIGGER_KEYS.map((k) => <MenuItem key={k} value={k}>{TRIGGERS[k].label}</MenuItem>)}
            </Select>
          </Labeled>
          <Labeled label="Channel" sx={{ flex: 1 }}>
            <Select fullWidth size="small" value={channelId} displayEmpty onChange={(e) => setChannelId(e.target.value)}>
              <MenuItem value="">All channels</MenuItem>
              {channels.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </Labeled>
        </Box>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: -1 }}>{TRIGGERS[trigger]?.desc}</Typography>
        {needsKeywords && <Labeled label="Keywords (comma separated)"><TextField fullWidth value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="price, harga, quote" /></Labeled>}
        {needsIdle && <Labeled label="Idle minutes"><TextField fullWidth type="number" value={idleMinutes} onChange={(e) => setIdleMinutes(e.target.value)} /></Labeled>}
        <Divider textAlign="left" sx={{ fontSize: 12, color: "text.secondary" }}>THEN</Divider>
        <Labeled label="Action">
          <Select fullWidth size="small" value={action} onChange={(e) => setAction(e.target.value)}>
            {Object.entries(ACTIONS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </Select>
        </Labeled>
        {needsMessage && (
          <Labeled label={action === "send_template" ? "Template name" : action === "webhook_notify" ? "Webhook URL" : "Message"}>
            <TextField fullWidth multiline={action === "send_message"} minRows={action === "send_message" ? 2 : 1}
              value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={action === "send_template" ? "welcome_v1" : action === "webhook_notify" ? "https://..." : "Type the auto reply..."} />
          </Labeled>
        )}
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Add more steps and branching in the visual flow builder after saving.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{isEdit ? "Save" : "Create"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function Labeled({ label, children, sx }: { label: string; children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={sx}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>{label}</Typography>
      {children}
    </Box>
  );
}
