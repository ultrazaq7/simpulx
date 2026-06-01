"use client";
import { useEffect, useState } from "react";
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, CircularProgress } from "@mui/material";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { AuditEntry } from "@/lib/types";
import { PageBody } from "../_shared";

const ACTION_COLOR: Record<string, string> = { created: "#16A34A", deleted: "#DC2626", updated: "#2563EB", submitted: "#7C3AED", tested: "#0891B2" };

function detailText(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  return Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

export default function AuditSettingsPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.listAuditLog().then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <PageBody>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "#FAFBFC" } }}>
                <TableCell>When</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity</TableCell>
                <TableCell>Detail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5 }}><CircularProgress size={22} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography sx={{ fontWeight: 600 }}>No activity yet</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Actions like creating channels or submitting templates will appear here.</Typography>
                </TableCell></TableRow>
              ) : rows.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell><Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{fmtDate(e.created_at)}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontSize: 13 }}>{e.actor_name || "System"}</Typography></TableCell>
                  <TableCell><Chip size="small" label={e.action} sx={{ textTransform: "capitalize", fontWeight: 700, fontSize: 10, bgcolor: `${ACTION_COLOR[e.action] ?? "#64748B"}1a`, color: ACTION_COLOR[e.action] ?? "#64748B" }} /></TableCell>
                  <TableCell><Typography sx={{ fontSize: 12.5, textTransform: "capitalize" }}>{e.entity_type}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontSize: 12, color: "text.secondary" }}>{detailText(e.detail)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </PageBody>
  );
}
