"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, Avatar, Chip, TextField, InputAdornment, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, Skeleton, IconButton, Select, MenuItem,
  Checkbox,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import KeyboardDoubleArrowLeftRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftRounded";
import KeyboardDoubleArrowRightRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowRightRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { initials, channelColor, interestColor, fmtDate } from "@/lib/utils";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  useEffect(() => { api.listContacts().then((c) => { setContacts(c); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const filtered = contacts.filter((c) => !query || (c.full_name || c.phone || "").toLowerCase().includes(query.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  return (
    <Shell>
      <Box sx={{ px: 2, pt: 2, pb: 3 }}>
        {/* ── Toolbar ── */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 24, fontWeight: 800, mr: "auto" }}>Contacts</Typography>
          <Button variant="contained" startIcon={<PersonAddAltRoundedIcon />} sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600, px: 2, boxShadow: "none" }}>
            Add Contact
          </Button>
        </Box>

        {/* ── Card Container ── */}
        <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <TextField
              size="small" placeholder="Search name, phone" value={query} onChange={(e) => setQuery(e.target.value)}
              slotProps={{ input: { startAdornment: <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} /> } }}
              sx={{ width: 340, "& .MuiOutlinedInput-root": { borderRadius: "8px", bgcolor: "#F3F4F6", "& fieldset": { border: "none" }, "&.Mui-focused fieldset": { border: "1px solid #2563EB" } } }}
            />
            <Box sx={{ flex: 1 }} />
            <Button variant="outlined" size="small" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />} sx={{ textTransform: "none", borderRadius: "8px" }}>Export</Button>
          </Box>

          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow sx={{ "& th": { bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", py: 1.5, fontWeight: 700, fontSize: 13, color: "text.primary" } }}>
                  <TableCell padding="checkbox" sx={{ width: 40 }}><Checkbox size="small" /></TableCell>
                  <TableCell>Contact Name</TableCell>
                  <TableCell>Channel</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Interest</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={7}><Skeleton height={40} /></TableCell></TableRow>
                )) : paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                      <Typography sx={{ fontWeight: 600, color: "text.primary", mb: 0.5 }}>No contacts found</Typography>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>Try adjusting your search criteria.</Typography>
                    </TableCell>
                  </TableRow>
                ) : paged.map((c) => (
                  <TableRow key={c.id} hover sx={{ "& td": { borderBottom: "1px solid", borderColor: "rgba(0,0,0,0.04)" } }}>
                    <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: channelColor(c.source_channel) + "20", color: channelColor(c.source_channel) }}>
                          {initials(c.full_name || c.phone)}
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontWeight: 600, fontSize: 14, color: "text.primary" }}>{c.full_name || c.phone || "Unnamed"}</Typography>
                          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{fmtDate(c.created_at)}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={c.source_channel || "Unknown"} size="small" sx={{ fontSize: 11, fontWeight: 600, bgcolor: channelColor(c.source_channel) + "15", color: channelColor(c.source_channel), textTransform: "capitalize", borderRadius: "8px" }} />
                    </TableCell>
                    <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{c.phone || "-"}</Typography></TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: interestColor(c.interest_level) }} />
                        <Typography variant="body2" sx={{ textTransform: "capitalize", fontWeight: 500 }}>{c.interest_level || "-"}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {c.stage_name ? <Chip label={c.stage_name} size="small" sx={{ fontSize: 11, fontWeight: 600, bgcolor: "#E3F2FD", color: "#1565C0", borderRadius: "8px" }} /> : <Typography variant="body2" color="text.disabled">-</Typography>}
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: 0.5 }}>
                        <EditOutlinedIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

        {/* ── Pagination (V1 style) ── */}
        <Box sx={{ display: "flex", alignItems: "center", py: 1.5, px: 1, mt: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>Total Data: {filtered.length}</Typography>
          <Box sx={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 0.5 }}>
            <IconButton size="small" disabled={page <= 1} onClick={() => setPage(1)}>
              <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Box sx={{ px: 1.5, py: 0.5, borderRadius: "8px", border: "1px solid", borderColor: "primary.main", color: "primary.main", fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: "center" }}>
              {page}
            </Box>
            <IconButton size="small" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
              <KeyboardDoubleArrowRightRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>Show per Page:</Typography>
            <Select size="small" value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              sx={{ fontSize: 13, borderRadius: "8px", minWidth: 100, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(0,0,0,0.15)" } }}
            >
              <MenuItem value={50}>50 rows</MenuItem>
              <MenuItem value={100}>100 rows</MenuItem>
              <MenuItem value={200}>200 rows</MenuItem>
            </Select>
          </Box>
        </Box>
        </Box>
      </Box>
    </Shell>
  );
}
