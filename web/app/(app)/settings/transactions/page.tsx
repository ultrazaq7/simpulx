"use client";
// Platform transactions: the approval queue for signups and credit top-ups, plus
// the numbers an operator actually asks for (what is waiting, what was approved
// this month, how much money that was).
//
// Approval is the moment things happen — a signup becomes an organisation, a
// top-up becomes credits — so both actions confirm with the concrete effect
// spelled out, and a top-up cannot be approved without explicitly picking the
// organisation the credits land on. Guessing the tenant money lands on is not a
// place to be clever.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Check, X, FileText, Clock, Building2, Zap, Wallet } from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Select } from "@/components/Select";
import { useToast, PageBody, SettingsCard } from "../_shared";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import type { OrgRow, PlatformTransaction } from "@/lib/types";

const rp = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");

export default function TransactionsPage() {
  const { notify, confirm, ToastHost } = useToast();
  const [rows, setRows] = useState<PlatformTransaction[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topupOrg, setTopupOrg] = useState<Record<string, string>>({});

  function load() {
    api.listTransactions().then((r) => { setRows(r.rows); setSummary(r.summary as Record<string, number>); }).catch(() => setRows([]));
    api.listOrgs().then(setOrgs).catch(() => {});
  }
  useEffect(load, []);

  const orgOptions = useMemo(() => orgs.map((o) => ({ value: o.id, label: o.name })), [orgs]);

  async function approve(t: PlatformTransaction) {
    const effect = t.type === "signup"
      ? `Organisasi "${t.org_name}" dibuat, owner ${t.contact_email} dapat email set-password.`
      : `${t.credits} kredit ditambahkan ke organisasi terpilih.`;
    if (!(await confirm({ title: "Approve?", message: effect, confirmLabel: "Approve" }))) return;
    setBusyId(t.id);
    try {
      await api.approveTransaction(t.id, t.type === "topup" ? { organization_id: topupOrg[t.id] } : {});
      notify("Approved"); load();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusyId(null); }
  }
  async function reject(t: PlatformTransaction) {
    if (!(await confirm({ title: "Reject?", message: "Permintaan ditandai ditolak. Tidak ada yang dibuat.", danger: true, confirmLabel: "Reject" }))) return;
    setBusyId(t.id);
    try { await api.rejectTransaction(t.id); notify("Rejected"); load(); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusyId(null); }
  }
  // The invoice route needs the JWT, so a plain <a href> would 401: fetch it with
  // auth and open the HTML in a new tab, where its own button prints to PDF.
  async function openInvoice(t: PlatformTransaction) {
    try {
      const r = await fetch(`/api/platform/transactions/${t.id}/invoice`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const wnd = window.open("", "_blank");
      if (wnd) { wnd.document.write(await r.text()); wnd.document.close(); }
    } catch (e) { notify(String(e), "error"); }
  }

  const cards = [
    { label: "Menunggu approval", value: summary.pending ?? 0, Icon: Clock },
    { label: "Approved bulan ini", value: summary.approved_month ?? 0, Icon: Check },
    { label: "Nilai bulan ini", value: rp(Number(summary.amount_month ?? 0)), Icon: Wallet },
    { label: "Trial aktif (total)", value: summary.trials_approved ?? 0, Icon: Zap },
  ];

  return (
    <PageBody wide>
      {ToastHost}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11.5px] text-muted-foreground mb-0.5 flex items-center gap-1.5"><c.Icon className="w-3.5 h-3.5" />{c.label}</p>
            <p className="text-[20px] font-bold tabular-nums text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      <SettingsCard>
        <div className="px-4 pt-4">
          <p className="text-[15px] font-bold text-foreground">Transactions</p>
          <p className="text-[12.5px] text-muted-foreground">Pendaftaran dan top up kredit, approve manual di sini</p>
        </div>
        <div className="px-4 pb-4">
        {rows === null ? (
          <div className="h-32 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-10">Belum ada permintaan. Form publiknya ada di /register.</p>
        ) : (
          <div className="divide-y divide-border/70">
            {rows.map((t) => (
              <div key={t.id} className="py-3 flex items-start gap-3 flex-wrap">
                <div className={cn("w-9 h-9 rounded-lg grid place-items-center shrink-0",
                  t.type === "signup" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600")}>
                  {t.type === "signup" ? <Building2 className="w-4.5 h-4.5" /> : <Zap className="w-4.5 h-4.5" />}
                </div>
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {t.type === "signup" ? (t.org_name || "(tanpa nama)") : `Top up ${t.credits} kredit`}
                    <span className="ml-2 text-[11px] font-bold uppercase text-muted-foreground">{t.package_name}</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {t.contact_name} &middot; {t.contact_email}{t.contact_phone ? ` · ${t.contact_phone}` : ""}
                  </p>
                  {t.note && <p className="text-[12px] text-muted-foreground italic mt-0.5">&ldquo;{t.note}&rdquo;</p>}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtDateTimeShort(t.created_at)}
                    {t.status === "approved" && t.org_linked_name ? ` · → ${t.org_linked_name}` : ""}
                    {t.invoice_no ? ` · INV-${t.invoice_no}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 mr-2">
                  <p className="text-[14px] font-bold tabular-nums">{t.amount > 0 ? rp(t.amount) : "Gratis"}</p>
                  <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-bold uppercase",
                    t.status === "pending" ? "bg-amber-500/10 text-amber-600"
                      : t.status === "approved" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                    {t.status}
                  </span>
                </div>
                {t.status === "pending" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {t.type === "topup" && (
                      <Select value={topupOrg[t.id] || ""} onChange={(v) => setTopupOrg((m) => ({ ...m, [t.id]: v }))}
                        options={orgOptions} placeholder="Pilih organisasi" className="w-[180px]" />
                    )}
                    <button onClick={() => approve(t)} disabled={busyId === t.id || (t.type === "topup" && !topupOrg[t.id])}
                      className="inline-flex items-center gap-1 px-3 h-8 rounded-md bg-primary text-white text-[12.5px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50">
                      {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Approve
                    </button>
                    <button onClick={() => reject(t)} disabled={busyId === t.id}
                      className="inline-flex items-center gap-1 px-3 h-8 rounded-md border border-border text-[12.5px] font-semibold text-destructive hover:bg-muted outline-none">
                      <X className="w-3.5 h-3.5" />Reject
                    </button>
                  </div>
                ) : t.status === "approved" && t.invoice_no ? (
                  <button onClick={() => openInvoice(t)}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-[12.5px] font-semibold hover:bg-muted outline-none shrink-0">
                    <FileText className="w-3.5 h-3.5" />Invoice
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        </div>
      </SettingsCard>
    </PageBody>
  );
}
