"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, Button, IconButton, Switch, Tooltip, Divider, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Snackbar, Alert,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import LockClockRoundedIcon from "@mui/icons-material/LockClockRounded";
import ChannelIcon, { CHANNEL_CATALOG, channelMeta, type ChannelMeta } from "@/components/ChannelIcon";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { Channel } from "@/lib/types";

const STATUS: Record<string, { label: string; color: string }> = {
  connected: { label: "Connected", color: "#16A34A" },
  pending: { label: "Pending setup", color: "#F59E0B" },
  disconnected: { label: "Disconnected", color: "#9CA3AF" },
  error: { label: "Error", color: "#EF4444" },
};

function StatusDot({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.disconnected;
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: s.color }} />
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</Typography>
    </Box>
  );
}

type DialogState = { open: boolean; type: string; editing: Channel | null };

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("whatsapp");
  const [dialog, setDialog] = useState<DialogState>({ open: false, type: "whatsapp", editing: null });
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    try { setChannels(await api.listChannels()); }
    catch { /* unauthenticated handled in api */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const meta = channelMeta(selected);
  const countFor = (type: string) => channels.filter((c) => {
    if (type === "testing") return c.type === "whatsapp" && (c.config as Record<string,any>)?.is_sandbox;
    if (type === "whatsapp") return c.type === "whatsapp" && !(c.config as Record<string,any>)?.is_sandbox;
    return c.type === type;
  }).length;
  
  const ofType = useMemo(() => channels.filter((c) => {
    if (selected === "testing") return c.type === "whatsapp" && (c.config as Record<string,any>)?.is_sandbox;
    if (selected === "whatsapp") return c.type === "whatsapp" && !(c.config as Record<string,any>)?.is_sandbox;
    return c.type === selected;
  }), [channels, selected]);

  async function test(c: Channel) {
    try { await api.testChannel(c.id); setToast({ msg: "Connection verified", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  async function toggleActive(c: Channel) {
    try { await api.updateChannel(c.id, { is_active: !c.is_active }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }
  async function remove(c: Channel) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try { await api.deleteChannel(c.id); setToast({ msg: "Channel deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* ── Left rail: channel catalog ── */}
        <Box sx={{ width: 312, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", bgcolor: "background.paper", overflowY: "auto", py: 1.5 }}>
          {CHANNEL_CATALOG.map((c) => {
            const active = selected === c.type;
            const n = countFor(c.type);
            return (
              <Box key={c.type} onClick={() => setSelected(c.type)} sx={{
                display: "flex", alignItems: "center", gap: 1.5, mx: 1.25, px: 1.5, py: 1.25, borderRadius: "8px", cursor: "pointer",
                bgcolor: active ? "action.selected" : "transparent",
                "&:hover": { bgcolor: active ? "action.selected" : "action.hover" }, transition: "background 0.12s",
              }}>
                <ChannelIcon type={c.type} size={34} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: active ? "primary.main" : "text.primary", lineHeight: 1.2 }} noWrap>
                    {c.name}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: "text.secondary" }} noWrap>
                    {c.available ? c.blurb : "Coming soon"}
                  </Typography>
                </Box>
                {c.type !== "testing" && (n > 0 ? (
                  <Box sx={{ minWidth: 20, height: 20, px: 0.75, borderRadius: "8px", bgcolor: active ? "primary.main" : "action.hover", color: active ? "#fff" : "text.secondary", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>
                    {n}
                  </Box>
                ) : !c.available ? (
                  <LockClockRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                ) : null)}
              </Box>
            );
          })}
        </Box>

        {/* ── Right panel: detail ── */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 4, bgcolor: "background.default" }}>
          {selected === "testing"
            ? <TestingPanel 
                loading={loading} channels={ofType}
                onAdd={() => setDialog({ open: true, type: selected, editing: null })}
                onEdit={(c) => setDialog({ open: true, type: c.type, editing: c })}
                onTest={test} onToggle={toggleActive} onDelete={remove} onRefresh={load}
              />
            : <ConnectedPanel
                meta={meta} loading={loading} channels={ofType}
                onAdd={() => setDialog({ open: true, type: selected, editing: null })}
                onEdit={(c) => setDialog({ open: true, type: c.type, editing: c })}
                onTest={test} onToggle={toggleActive} onDelete={remove} onRefresh={load}
              />}
        </Box>

      <ChannelDialog
        state={dialog}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSaved={(msg) => { setDialog((d) => ({ ...d, open: false })); setToast({ msg, sev: "success" }); load(); }}
        onError={(msg) => setToast({ msg, sev: "error" })}
      />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)} sx={{ maxWidth: 460 }}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

// ── Detail panel for an available / coming-soon platform ───────────────
function ConnectedPanel({ meta, loading, channels, onAdd, onEdit, onTest, onToggle, onDelete, onRefresh }: {
  meta: ChannelMeta; loading: boolean; channels: Channel[];
  onAdd: () => void; onEdit: (c: Channel) => void; onTest: (c: Channel) => void;
  onToggle: (c: Channel) => void; onDelete: (c: Channel) => void; onRefresh: () => void;
}) {
  return (
    <Box sx={{ maxWidth: 880, mx: "auto" }}>
      {/* Hero header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2.5, p: 2, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
        <ChannelIcon type={meta.type} size={56} radius={16} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{meta.name}</Typography>
          <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 0.5, maxWidth: 560 }}>{meta.description}</Typography>
        </Box>
        {meta.available && (
          <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onAdd} sx={{ whiteSpace: "nowrap" }}>
              Add channel
            </Button>
          </Box>
        )}
      </Box>

      {!meta.available ? (
        <Box sx={{ textAlign: "center", py: 9 }}>
          <Box sx={{ opacity: 0.5, display: "inline-flex", mb: 2 }}><ChannelIcon type={meta.type} size={64} radius={18} /></Box>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{meta.name} is coming soon</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>This channel is on the roadmap. We will let you know when it is ready to connect.</Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary", textTransform: "uppercase" }}>
              Connected accounts
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Refresh"><IconButton size="small" onClick={onRefresh}><RefreshRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
          </Box>

          {loading ? (
            [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1.5, borderRadius: "8px" }} />)
          ) : channels.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 7, border: "1px dashed", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper" }}>
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>No {meta.name} accounts yet</Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2 }}>Connect your first account to start messaging.</Typography>
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onAdd}>Add channel</Button>
            </Box>
          ) : (
            channels.map((c) => (
              <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 2, p: 2, mb: 1.5, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", opacity: c.is_active ? 1 : 0.6 }}>
                <ChannelIcon type={c.type} size={42} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{c.name}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }} noWrap>
                    {c.display_id || c.phone_number_id || "Not configured"}
                    {c.connected_at ? ` · since ${fmtDate(c.connected_at)}` : ""}
                  </Typography>
                </Box>
                <StatusDot status={c.status} />
                <Tooltip title={c.is_active ? "Active" : "Disabled"}>
                  <Switch size="small" checked={c.is_active} onChange={() => onToggle(c)} />
                </Tooltip>
                <Button variant="outlined" size="small" startIcon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => onTest(c)}>Test</Button>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => onEdit(c)}><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" onClick={() => onDelete(c)} sx={{ color: "error.main" }}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
              </Box>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}

// ── Testing sandbox panel (mock mode explainer) ────────────────────────
function TestingPanel({ loading, channels, onAdd, onEdit, onTest, onToggle, onDelete, onRefresh }: {
  loading: boolean; channels: Channel[];
  onAdd: () => void; onEdit: (c: Channel) => void; onTest: (c: Channel) => void;
  onToggle: (c: Channel) => void; onDelete: (c: Channel) => void; onRefresh: () => void;
}) {
  const points = [
    { icon: ShieldOutlinedIcon, title: "Risk-free environment", body: "Simulate actions and flows without impacting real customers." },
    { icon: GroupsOutlinedIcon, title: "Testing for teams", body: "Each team member can run tests individually under the same workspace." },
    { icon: HubOutlinedIcon, title: "Real channel behavior", body: "See how workflows behave under real channel conditions." },
  ];
  return (
    <Box sx={{ maxWidth: 880, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2.5, p: 2, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
        <ChannelIcon type="testing" size={56} radius={16} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>Testing channel</Typography>
          <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 0.5, maxWidth: 600 }}>
            Experiment with Simpulx features in a safe space. Connect a sandbox WhatsApp number here to trigger real workflows without affecting your official channels.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onAdd} sx={{ whiteSpace: "nowrap" }}>
            Add sandbox WABA
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 3, mt: 3 }}>
        {points.map((p) => (
          <Box key={p.title} sx={{ flex: 1 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "action.selected", color: "primary.main", mb: 1 }}>
              <p.icon sx={{ fontSize: 20 }} />
            </Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{p.title}</Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>{p.body}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 5 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary", textTransform: "uppercase" }}>
            Sandbox accounts
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Refresh"><IconButton size="small" onClick={onRefresh}><RefreshRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
        </Box>

        {loading ? (
          [0].map((i) => <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1.5, borderRadius: "8px" }} />)
        ) : channels.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 5, border: "1px dashed", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper" }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>No sandbox accounts connected</Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5, mb: 2 }}>Connect a WABA to use for testing.</Typography>
            <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={onAdd}>Add sandbox WABA</Button>
          </Box>
        ) : (
          channels.map((c) => (
            <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 2, p: 2, mb: 1.5, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", opacity: c.is_active ? 1 : 0.6 }}>
              <ChannelIcon type="testing" size={42} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{c.name}</Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }} noWrap>
                  {c.display_id || c.phone_number_id || "Not configured"}
                  {c.connected_at ? ` · since ${fmtDate(c.connected_at)}` : ""}
                </Typography>
              </Box>
              <StatusDot status={c.status} />
              <Tooltip title={c.is_active ? "Active" : "Disabled"}>
                <Switch size="small" checked={c.is_active} onChange={() => onToggle(c)} />
              </Tooltip>
              <Button variant="outlined" size="small" startIcon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => onTest(c)}>Test</Button>
              <Tooltip title="Edit"><IconButton size="small" onClick={() => onEdit(c)}><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
              <Tooltip title="Delete"><IconButton size="small" onClick={() => onDelete(c)} sx={{ color: "error.main" }}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
            </Box>
          ))
        )}
      </Box>

      <Typography sx={{ fontSize: 15, fontWeight: 700, mt: 4, mb: 1.5 }}>All tests</Typography>
      <Box sx={{ display: "flex", gap: 2.5 }}>
        {[
          { icon: PlayArrowRoundedIcon, title: "Test Inbox conversations", body: "Simulate a customer chat to see how the Inbox supports collaboration, assignment, and contact management.", cta: "Start a simulated chat", href: "/inbox" },
          { icon: AccountTreeRoundedIcon, title: "Test automation", body: "Trigger an incoming message and watch your automation rules and AI agent respond end to end.", cta: "Open automation", href: "/inbox" },
        ].map((t) => (
          <Box key={t.title} sx={{ flex: 1, p: 2, borderRadius: "8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column" }}>
            <t.icon sx={{ fontSize: 26, color: "text.secondary" }} />
            <Typography sx={{ fontSize: 15, fontWeight: 700, mt: 1.5 }}>{t.title}</Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.5, mb: 2, flex: 1 }}>{t.body}</Typography>
            <Button variant="contained" startIcon={<t.icon sx={{ fontSize: 18 }} />} href={t.href}>{t.cta}</Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Add / edit channel dialog ──────────────────────────────────────────
function ChannelDialog({ state, onClose, onSaved, onError }: {
  state: DialogState; onClose: () => void;
  onSaved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const { type, editing } = state;
  const meta = channelMeta(type);
  const isEdit = !!editing;
  const cfg = (editing?.config ?? {}) as Record<string, string>;

  const [name, setName] = useState("");
  const [displayId, setDisplayId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [pageId, setPageId] = useState("");
  const [igId, setIgId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset fields whenever the dialog (re)opens.
  useEffect(() => {
    if (!state.open) return;
    setName(editing?.name ?? "");
    setDisplayId(editing?.display_id ?? "");
    setPhoneNumberId(editing?.phone_number_id ?? "");
    setWabaId(editing?.waba_id ?? "");
    setPageId((cfg.page_id as string) ?? "");
    setIgId((cfg.instagram_account_id as string) ?? "");
    setToken("");
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWa = type === "whatsapp" || type === "testing";
  const isIg = type === "instagram";
  const isMsgr = type === "messenger";

  async function save() {
    if (!name.trim()) { onError("Channel name is required"); return; }
    setSaving(true);
    const config: Record<string, unknown> = {};
    if (isMsgr || isIg) config.page_id = pageId.trim();
    if (isIg) config.instagram_account_id = igId.trim();
    if (type === "testing") config.is_sandbox = true;
    try {
      if (isEdit) {
        await api.updateChannel(editing!.id, {
          name: name.trim(), display_id: displayId.trim(),
          ...(token.trim() ? { access_token: token.trim() } : {}),
          config,
        });
        onSaved("Channel updated");
      } else {
        await api.createChannel({
          type: type === "testing" ? "whatsapp" : type, 
          name: name.trim(), display_id: displayId.trim(),
          phone_number_id: isWa ? phoneNumberId.trim() : undefined,
          waba_id: isWa ? wabaId.trim() : undefined,
          access_token: token.trim() || undefined,
          config,
        });
        onSaved("Channel added — run Test to verify the connection");
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={state.open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1 }}>
        <ChannelIcon type={type} size={32} />
        {isEdit ? "Edit" : "Connect"} {meta.name}
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2.5 }}>
        <Field label="Channel name" value={name} onChange={setName} placeholder="e.g. Sales WhatsApp" autoFocus />
        {isWa && <>
          <Field label="Display number" value={displayId} onChange={setDisplayId} placeholder="+62 812 3456 7890" />
          <Field label="Phone Number ID (Meta)" value={phoneNumberId} onChange={setPhoneNumberId} />
          <Field label="WABA ID" value={wabaId} onChange={setWabaId} />
        </>}
        {(isMsgr || isIg) && <>
          <Field label="Page ID" value={pageId} onChange={setPageId} />
          {isIg && <Field label="Instagram Account ID" value={igId} onChange={setIgId} />}
          <Field label={isIg ? "Display handle" : "Page name"} value={displayId} onChange={setDisplayId} placeholder={isIg ? "@yourbrand" : "Your Page"} />
        </>}
        <Field label={isEdit ? "Access token (leave blank to keep)" : "Access token"} value={token} onChange={setToken} type="password" />
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{isEdit ? "Save" : "Connect"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>{label}</Typography>
      <TextField fullWidth value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} autoFocus={autoFocus} />
    </Box>
  );
}
