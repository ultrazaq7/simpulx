"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, TextField, Button, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Menu, MenuItem, Divider,
  FormControl, InputLabel, Select, Dialog, DialogTitle, DialogContent, DialogActions,
  InputAdornment, TablePagination, Tooltip,
} from "@mui/material";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { api, getUser } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { UserAccount } from "@/lib/types";
import { useToast, PageBody, ROLES, ROLE_COLOR, initials } from "../_shared";

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}

export default function PeopleSettingsPage() {
  const { notify, ToastHost } = useToast();
  const [rows, setRows] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dlg, setDlg] = useState<{ open: boolean; editing: UserAccount | null }>({ open: false, editing: null });
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; user: UserAccount } | null>(null);

  const me = getUser();
  const isPrivileged = me?.role === "admin" || me?.role === "owner";

  async function load() {
    setLoading(true);
    try { setRows(await api.listUsers()); } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(u: UserAccount) {
    if (!confirm(`Remove ${u.full_name}? They will lose access.`)) return;
    try { await api.deleteUser(u.id); notify("User removed", "info"); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function toggleStatus(u: UserAccount) {
    try { await api.updateUser(u.id, { status: u.status === "active" ? "inactive" : "active" }); notify(`User ${u.status === "active" ? "deactivated" : "activated"}`); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  const filtered = useMemo(() => rows.filter((u) =>
    (!roleFilter || u.role === roleFilter) &&
    (u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  ), [rows, search, roleFilter]);

  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { setPage(0); }, [search, roleFilter]);

  return (
    <PageBody maxWidth={1180}>
      {ToastHost}
      <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
          <TextField size="small" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} /> } }}
            sx={{ width: 300, "& .MuiOutlinedInput-root": { borderRadius: "8px", bgcolor: "#F3F4F6", "& fieldset": { border: "none" }, "&.Mui-focused fieldset": { border: "1px solid #2563EB" } } }} />
          <Select size="small" value={roleFilter} displayEmpty onChange={(e) => setRoleFilter(e.target.value)} sx={{ minWidth: 130, borderRadius: "8px" }}>
            <MenuItem value="">All roles</MenuItem>
            {ROLES.map((r) => <MenuItem key={r} value={r} sx={{ textTransform: "capitalize" }}>{r}</MenuItem>)}
          </Select>
          <Box sx={{ flex: 1 }} />
          {isPrivileged && (
            <Button variant="contained" onClick={() => setDlg({ open: true, editing: null })} sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600, px: 2, boxShadow: "none" }}>
              + Invite people
            </Button>
          )}
        </Box>

        <TableContainer>
          <Table size="medium" sx={{ minWidth: 920 }}>
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "#FAFBFC", borderBottom: "1px solid", borderColor: "divider", py: 1.25, fontWeight: 700, fontSize: 12.5, color: "text.secondary" } }}>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Departments</TableCell>
                <TableCell>Campaigns</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last login</TableCell>
                <TableCell>Joined</TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8, color: "text.secondary" }}>No people found</TableCell></TableRow>
              ) : paged.map((u) => (
                <TableRow key={u.id} hover sx={{ "& td": { borderBottom: "1px solid", borderColor: "rgba(0,0,0,0.04)", py: 1.25 } }}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ position: "relative" }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: `${ROLE_COLOR[u.role] ?? "#64748B"}1a`, color: ROLE_COLOR[u.role] ?? "#64748B", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>
                          {initials(u.full_name) || <PersonOutlineRoundedIcon sx={{ fontSize: 18 }} />}
                        </Box>
                        {u.is_online && <Box sx={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", bgcolor: "#16A34A", border: "2px solid #fff" }} />}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{u.full_name}{u.id === me?.id ? " (You)" : ""}</Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary" }} noWrap>{u.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={u.role} sx={{ textTransform: "capitalize", fontWeight: 700, fontSize: 10.5, bgcolor: `${ROLE_COLOR[u.role] ?? "#64748B"}1a`, color: ROLE_COLOR[u.role] ?? "#64748B" }} />
                  </TableCell>
                  <TableCell><CellChips items={u.department_names} empty="—" /></TableCell>
                  <TableCell><CellChips items={u.campaign_names} empty="—" /></TableCell>
                  <TableCell>
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                      <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: u.status === "active" ? "#16A34A" : "#9CA3AF" }} />
                      <Typography sx={{ fontSize: 12.5, textTransform: "capitalize", color: u.status === "active" ? "text.primary" : "text.secondary" }}>{u.status}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell><Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{relativeTime(u.last_login_at)}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{fmtDate(u.created_at)}</Typography></TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={(e) => setMenuAnchor({ el: e.currentTarget, user: u })} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: 0.5 }}>
                      <MoreHorizRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination component="div" count={filtered.length} page={page} onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]} sx={{ borderTop: "1px solid", borderColor: "divider" }} />

        <Menu anchorEl={menuAnchor?.el} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} slotProps={{ paper: { sx: { width: 180, borderRadius: "8px", mt: 0.5, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" } } }}>
          <MenuItem onClick={() => { if (menuAnchor) setDlg({ open: true, editing: menuAnchor.user }); setMenuAnchor(null); }} sx={{ fontSize: 13 }}>Edit user</MenuItem>
          {isPrivileged && menuAnchor?.user.id !== me?.id && (
            <MenuItem onClick={() => { if (menuAnchor) toggleStatus(menuAnchor.user); setMenuAnchor(null); }} sx={{ fontSize: 13 }}>
              {menuAnchor?.user.status === "active" ? "Deactivate" : "Activate"}
            </MenuItem>
          )}
          {isPrivileged && menuAnchor?.user.id !== me?.id && <Divider sx={{ my: 0.5 }} />}
          {isPrivileged && menuAnchor?.user.id !== me?.id && (
            <MenuItem onClick={() => { if (menuAnchor) remove(menuAnchor.user); setMenuAnchor(null); }} sx={{ fontSize: 13, color: "error.main" }}>Remove</MenuItem>
          )}
        </Menu>
      </Box>

      <UserDialog state={dlg} isPrivileged={isPrivileged} onClose={() => setDlg({ open: false, editing: null })}
        onSaved={(m) => { setDlg({ open: false, editing: null }); notify(m); load(); }}
        onError={(m) => notify(m, "error")} />
    </PageBody>
  );
}

function CellChips({ items, empty }: { items: string[] | null; empty: string }) {
  if (!items || items.length === 0) return <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>{empty}</Typography>;
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {items.slice(0, 2).map((n) => <Chip key={n} size="small" label={n} variant="outlined" sx={{ fontSize: 10.5, height: 20 }} />)}
      {items.length > 2 && <Chip size="small" label={`+${items.length - 2}`} sx={{ fontSize: 10.5, height: 20 }} />}
    </Box>
  );
}

function UserDialog({ state, isPrivileged, onClose, onSaved, onError }: {
  state: { open: boolean; editing: UserAccount | null }; isPrivileged: boolean;
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!state.editing;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("agent");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const u = state.editing;
    setEmail(u?.email ?? ""); setName(u?.full_name ?? ""); setRole(u?.role ?? "agent"); setPassword(""); setShowPw(false);
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!name.trim() || (!isEdit && !email.trim())) { onError("Name and email are required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const patch: { full_name: string; email?: string; role?: string; password?: string } = { full_name: name.trim() };
        if (isPrivileged) {
          patch.email = email.trim();
          patch.role = role;
          if (password.trim()) patch.password = password.trim();
        }
        await api.updateUser(state.editing!.id, patch);
        onSaved("User updated");
      } else {
        await api.createUser({ email: email.trim(), full_name: name.trim(), role, password: password.trim() || undefined });
        onSaved("User invited");
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={state.open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? "Edit user" : "Invite people"}</DialogTitle>
      <Divider />
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2.5 }}>
        <TextField label="Full name" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <TextField label="Email" size="small" fullWidth value={email} onChange={(e) => setEmail(e.target.value)}
          disabled={isEdit && !isPrivileged}
          helperText={isEdit && !isPrivileged ? "Only admins can change email" : undefined} />
        {(isPrivileged || !isEdit) && (
          <FormControl fullWidth size="small" disabled={isEdit && !isPrivileged}>
            <InputLabel>Role</InputLabel>
            <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <MenuItem key={r} value={r} sx={{ textTransform: "capitalize" }}>{r}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {(isPrivileged || !isEdit) && (
          <TextField label={isEdit ? "Reset password (optional)" : "Temporary password (optional)"} size="small" fullWidth
            type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
            helperText={isEdit ? "Leave blank to keep current password" : "Defaults to changeme123 if left blank"}
            slotProps={{ input: { endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPw(!showPw)} edge="end">
                  {showPw ? <VisibilityOutlinedIcon sx={{ fontSize: 18 }} /> : <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </InputAdornment>
            ) } }} />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : isEdit ? "Save" : "Invite"}</Button>
      </DialogActions>
    </Dialog>
  );
}
