"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, Button, IconButton, Tooltip, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel,
  OutlinedInput, Snackbar, Alert, Divider, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, CircularProgress,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { api } from "@/lib/api";
import type { Campaign, UserAccount } from "@/lib/types";

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dlg, setDlg] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [c, u] = await Promise.all([api.listCampaigns(), api.listUsers().catch(() => [])]);
      setRows(c); setUsers(u as UserAccount[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(c: Campaign) {
    if (!confirm(`Delete campaign "${c.name}"? Conversations stay but lose their campaign tag.`)) return;
    try { await api.deleteCampaign(c.id); setToast({ msg: "Campaign deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  const filtered = rows.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.dealer_name ?? "").toLowerCase().includes(search.toLowerCase()));
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { setPage(0); }, [search]);

  return (
    <Box sx={{ px: 3, pt: 3, pb: 3, maxWidth: 1180, mx: "auto" }}>
      <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
          <TextField size="small" placeholder="Search campaigns or dealers" value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} /> } }}
            sx={{ width: 320, "& .MuiOutlinedInput-root": { borderRadius: "8px", bgcolor: "#F3F4F6", "& fieldset": { border: "none" }, "&.Mui-focused fieldset": { border: "1px solid #2563EB" } } }} />
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDlg({ open: true, id: null })} sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600, boxShadow: "none" }}>New campaign</Button>
        </Box>

        <TableContainer>
          <Table size="medium" sx={{ minWidth: 940 }}>
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "#FAFBFC", borderBottom: "1px solid", borderColor: "divider", py: 1.25, fontWeight: 700, fontSize: 12.5, color: "text.secondary" } }}>
                <TableCell>Campaign</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Agents</TableCell>
                <TableCell align="right">Chats</TableCell>
                <TableCell align="right">Leads</TableCell>
                <TableCell>Attribution</TableCell>
                <TableCell>Routing</TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                  <StorefrontOutlinedIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
                  <Typography sx={{ fontWeight: 700 }}>{search ? "No matching campaigns" : "No campaigns yet"}</Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Create a campaign for a dealer to start routing their leads.</Typography>
                </TableCell></TableRow>
              ) : paged.map((c) => (
                <TableRow key={c.id} hover sx={{ "& td": { borderBottom: "1px solid", borderColor: "rgba(0,0,0,0.04)", py: 1.25 }, opacity: c.status === "active" ? 1 : 0.65 }}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "action.selected", color: "primary.main", flexShrink: 0 }}><StorefrontOutlinedIcon sx={{ fontSize: 19 }} /></Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{c.name}</Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary" }} noWrap>{c.dealer_name || "No dealer set"}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={c.status} sx={{ textTransform: "capitalize", fontWeight: 700, fontSize: 10, bgcolor: c.status === "active" ? "#DCFCE7" : "#F1F5F9", color: c.status === "active" ? "#15803D" : "#64748B" }} />
                  </TableCell>
                  <TableCell>
                    {c.agent_names && c.agent_names.length > 0 ? (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {c.agent_names.slice(0, 2).map((n) => <Chip key={n} size="small" label={n} variant="outlined" sx={{ fontSize: 10.5, height: 20 }} />)}
                        {c.agent_names.length > 2 && <Chip size="small" label={`+${c.agent_names.length - 2}`} sx={{ fontSize: 10.5, height: 20 }} />}
                      </Box>
                    ) : <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>None</Typography>}
                  </TableCell>
                  <TableCell align="right"><Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{c.conversations}</Typography></TableCell>
                  <TableCell align="right"><Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{c.lead_count}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, maxWidth: 220 }}>
                      {(c.ad_source_ids ?? []).map((s) => <Chip key={s} size="small" label={`ad: ${s}`} sx={{ fontSize: 10, height: 20, bgcolor: "rgba(37,99,235,0.1)", color: "#2563EB" }} />)}
                      {(c.keywords ?? []).map((k) => <Chip key={k} size="small" label={`kw: ${k}`} sx={{ fontSize: 10, height: 20, bgcolor: "rgba(13,148,136,0.1)", color: "#0D9488" }} />)}
                      {((c.ad_source_ids?.length ?? 0) + (c.keywords?.length ?? 0)) === 0 && <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>None</Typography>}
                    </Box>
                  </TableCell>
                  <TableCell><Typography sx={{ fontSize: 12.5, color: "text.secondary", textTransform: "capitalize" }}>{c.routing_strategy.replace("_", " ")}</Typography></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg({ open: true, id: c.id })}><EditOutlinedIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" sx={{ color: "error.main" }} onClick={() => remove(c)}><DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination component="div" count={filtered.length} page={page} onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]} sx={{ borderTop: "1px solid", borderColor: "divider" }} />
      </Box>

      <CampaignDialog dlg={dlg} users={users}
        onClose={() => setDlg({ open: false, id: null })}
        onSaved={(m) => { setDlg({ open: false, id: null }); setToast({ msg: m, sev: "success" }); load(); }}
        onError={(m) => setToast({ msg: m, sev: "error" })} />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function CampaignDialog({ dlg, users, onClose, onSaved, onError }: {
  dlg: { open: boolean; id: string | null }; users: UserAccount[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!dlg.id;
  const [name, setName] = useState("");
  const [dealer, setDealer] = useState("");
  const [status, setStatus] = useState("active");
  const [routing, setRouting] = useState("round_robin");
  const [adSources, setAdSources] = useState("");
  const [keywords, setKeywords] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dlg.open) return;
    if (dlg.id) {
      api.getCampaign(dlg.id).then((c) => {
        setName(c.name); setDealer(c.dealer_name ?? ""); setStatus(c.status); setRouting(c.routing_strategy);
        setAdSources((c.ad_source_ids ?? []).join(", ")); setKeywords((c.keywords ?? []).join(", "));
        setAgentIds(c.agent_ids ?? []);
      }).catch((e) => onError(String(e)));
    } else {
      setName(""); setDealer(""); setStatus("active"); setRouting("round_robin"); setAdSources(""); setKeywords(""); setAgentIds([]);
    }
  }, [dlg.open, dlg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function csv(s: string) { return s.split(",").map((x) => x.trim()).filter(Boolean); }

  async function save() {
    if (!name.trim()) { onError("Campaign name is required"); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), dealer_name: dealer.trim(), status, routing_strategy: routing,
      ad_source_ids: csv(adSources), keywords: csv(keywords), agent_ids: agentIds,
    };
    try {
      if (isEdit) { await api.updateCampaign(dlg.id!, payload); onSaved("Campaign updated"); }
      else { await api.createCampaign(payload); onSaved("Campaign created"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={dlg.open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? "Edit campaign" : "New campaign"}</DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2.5 }}>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Field label="Campaign name" sx={{ flex: 1 }}><TextField fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Honda Brio - Jakarta" autoFocus /></Field>
          <Field label="Dealer" sx={{ flex: 1 }}><TextField fullWidth size="small" value={dealer} onChange={(e) => setDealer(e.target.value)} placeholder="Dealer name" /></Field>
        </Box>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Field label="Status" sx={{ flex: 1 }}>
            <Select fullWidth size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="paused">Paused</MenuItem>
            </Select>
          </Field>
          <Field label="Routing" sx={{ flex: 1 }}>
            <Select fullWidth size="small" value={routing} onChange={(e) => setRouting(e.target.value)}>
              <MenuItem value="round_robin">Round-robin</MenuItem>
              <MenuItem value="manual">Manual</MenuItem>
            </Select>
          </Field>
        </Box>
        <Field label="Agents">
          <FormControl fullWidth size="small">
            <Select multiple value={agentIds} onChange={(e) => setAgentIds(typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value)}
              input={<OutlinedInput />}
              renderValue={(sel) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {(sel as string[]).map((id) => <Chip key={id} size="small" label={users.find((u) => u.id === id)?.full_name ?? id} />)}
                </Box>
              )}>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
            </Select>
          </FormControl>
        </Field>
        <Divider textAlign="left" sx={{ fontSize: 11, color: "text.secondary" }}>ATTRIBUTION</Divider>
        <Field label="CTWA ad source IDs (comma separated)"><TextField fullWidth size="small" value={adSources} onChange={(e) => setAdSources(e.target.value)} placeholder="ad_honda_brio_2026" /></Field>
        <Field label="Keywords in first message (comma separated)"><TextField fullWidth size="small" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="brio, honda" /></Field>
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
