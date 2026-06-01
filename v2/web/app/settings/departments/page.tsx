"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, TextField, Button, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Menu, MenuItem, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { api } from "@/lib/api";
import type { Department } from "@/lib/types";
import { useToast, PageBody } from "../_shared";

export default function DepartmentsSettingsPage() {
  const { notify, ToastHost } = useToast();
  const [rows, setRows] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; editing: Department | null }>({ open: false, editing: null });
  const [search, setSearch] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; dept: Department } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setRows(await api.listDepartments()); } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openDlg(d: Department | null) { setName(d?.name ?? ""); setDlg({ open: true, editing: d }); }
  async function save() {
    if (!name.trim()) { notify("Name is required", "error"); return; }
    setSaving(true);
    try {
      if (dlg.editing) { await api.updateDepartment(dlg.editing.id, name.trim()); notify("Department updated"); }
      else { await api.createDepartment(name.trim()); notify("Department created"); }
      setDlg({ open: false, editing: null }); load();
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }
  async function remove(d: Department) {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    try { await api.deleteDepartment(d.id); notify("Department deleted", "info"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  const filtered = rows.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageBody>
      {ToastHost}
      <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <TextField size="small" placeholder="Search departments by name" value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} /> } }}
            sx={{ width: 340, "& .MuiOutlinedInput-root": { borderRadius: "8px", bgcolor: "#F3F4F6", "& fieldset": { border: "none" }, "&.Mui-focused fieldset": { border: "1px solid #2563EB" } } }} />
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" onClick={() => openDlg(null)} sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600, px: 2, boxShadow: "none" }}>+ Add department</Button>
        </Box>

        <TableContainer>
          <Table size="medium">
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", py: 1.5, fontWeight: 700, fontSize: 13, color: "text.primary" } }}>
                <TableCell>Name</TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={2} align="center" sx={{ py: 8 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={2} align="center" sx={{ py: 8, color: "text.secondary" }}>No departments found</TableCell></TableRow>
              ) : filtered.map((d) => (
                <TableRow key={d.id} hover sx={{ "& td": { borderBottom: "1px solid", borderColor: "rgba(0,0,0,0.04)" } }}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(0,0,0,0.04)", color: "text.secondary", display: "grid", placeItems: "center" }}>
                        <BusinessOutlinedIcon sx={{ fontSize: 18 }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>{d.name}</Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{d.members} member{d.members === 1 ? "" : "s"}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={(e) => setMenuAnchor({ el: e.currentTarget, dept: d })} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: 0.5 }}>
                      <MoreHorizRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Menu anchorEl={menuAnchor?.el} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} slotProps={{ paper: { sx: { width: 160, borderRadius: "8px", mt: 0.5, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" } } }}>
          <MenuItem onClick={() => { if (menuAnchor) openDlg(menuAnchor.dept); setMenuAnchor(null); }} sx={{ fontSize: 13 }}>Rename</MenuItem>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem onClick={() => { if (menuAnchor) remove(menuAnchor.dept); setMenuAnchor(null); }} sx={{ fontSize: 13, color: "error.main" }}>Delete</MenuItem>
        </Menu>
      </Box>

      <Dialog open={dlg.open} onClose={() => setDlg({ open: false, editing: null })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{dlg.editing ? "Rename department" : "New department"}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <TextField label="Department name" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Sales" />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2.5 }}>
          <Button onClick={() => setDlg({ open: false, editing: null })} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>{dlg.editing ? "Save" : "Create"}</Button>
        </DialogActions>
      </Dialog>
    </PageBody>
  );
}
