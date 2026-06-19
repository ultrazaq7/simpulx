"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { AuditEntry } from "@/lib/types";
import { PageBody, SettingsCard } from "../_shared";

const ACTION_COLOR: Record<string, string> = { created: "#16A34A", deleted: "#DC2626", updated: "#2563EB", submitted: "#7C3AED", tested: "#0891B2" };

function detailText(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  return Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso);
}

export default function AuditSettingsPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.listAuditLog().then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <PageBody fill>
      <SettingsCard className="overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">When</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actor</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Entity</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <p className="font-semibold text-foreground mb-1">No activity yet</p>
                    <p className="text-xs text-muted-foreground">Actions like creating channels or submitting templates will appear here.</p>
                  </td>
                </tr>
              ) : rows.map((e) => (
                <tr key={e.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <Tip label={fmtDate(e.created_at)}><td className="px-4 py-2.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{relativeTime(e.created_at)}</td></Tip>
                  <td className="px-4 py-2.5 text-[13px] text-foreground">{e.actor_name || "System"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold capitalize"
                      style={{ backgroundColor: `${ACTION_COLOR[e.action] ?? "#64748B"}1a`, color: ACTION_COLOR[e.action] ?? "#64748B" }}
                    >{e.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-foreground capitalize">{e.entity_type}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{detailText(e.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>
    </PageBody>
  );
}
