"use client";
// Platform transactions: numbered table + pagination, and a detail drawer per
// row. The drawer is where decisions happen · approve/reject with the concrete
// effect spelled out, the transfer receipt beside it, and for approved rows an
// inline invoice preview with a download button. All copy goes through i18n; an
// operator page is still an app page, not a place to hardcode one language.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Check, X, Eye, FileText, Clock, Zap, Wallet, ExternalLink, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, getToken } from "@/lib/api";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import DateRangeFilter, { type DateRangeValue } from "@/components/DateRangeFilter";
import { useToast, PageBody, SettingsCard } from "../_shared";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import type { OrgRow, PlatformTransaction } from "@/lib/types";

const rp = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");
const PER_PAGE = 15;

export default function TransactionsPage() {
  const { t } = useI18n();
  const { notify, confirm, ToastHost } = useToast();
  const [rows, setRows] = useState<PlatformTransaction[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [topupOrg, setTopupOrg] = useState("");
  const [invoiceHTML, setInvoiceHTML] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  // Filter tanggal yang sama dengan dashboard: preset + calendar range.
  const [range, setRange] = useState<DateRangeValue>({ preset: "all", from: "", to: "" });

  function load() {
    api.listTransactions().then((r) => { setRows(r.rows); setSummary(r.summary as Record<string, number>); }).catch(() => setRows([]));
    api.listOrgs().then(setOrgs).catch(() => {});
  }
  useEffect(load, []);

  const orgOptions = useMemo(() => orgs.map((o) => ({ value: o.id, label: o.name })), [orgs]);
  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!range.from) return rows; // "all"
    return rows.filter((r) => {
      const d = new Date(r.created_at);
      const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return s >= range.from && (!range.to || s <= range.to);
    });
  }, [rows, range]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const open = rows?.find((r) => r.id === openId) || null;

  // The invoice endpoint needs the JWT, so it is fetched with auth and shown
  // inline (iframe srcDoc) for preview; download opens the same HTML in a tab
  // where its own button prints to PDF.
  useEffect(() => {
    setInvoiceHTML(null);
    if (!open || open.status !== "approved" || !open.invoice_no) return;
    fetch(`/api/platform/transactions/${open.id}/invoice`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.text() : Promise.reject(r.statusText)))
      .then(setInvoiceHTML).catch(() => setInvoiceHTML(null));
  }, [openId, open?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve(tx: PlatformTransaction) {
    const effect = tx.type === "signup"
      ? t("tx.approveSignupMsg", { org: tx.org_name || "", email: tx.contact_email })
      : t("tx.approveTopupMsg", { n: tx.credits });
    if (!(await confirm({ title: t("tx.approve") + "?", message: effect, confirmLabel: t("tx.approve") }))) return;
    setBusy(true);
    try {
      await api.approveTransaction(tx.id, tx.type === "topup" ? { organization_id: topupOrg } : {});
      notify(t("tx.approved")); load();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function reject(tx: PlatformTransaction) {
    if (!(await confirm({ title: t("tx.reject") + "?", message: t("tx.rejectMsg"), danger: true, confirmLabel: t("tx.reject") }))) return;
    setBusy(true);
    try { await api.rejectTransaction(tx.id); notify(t("tx.rejected")); setOpenId(null); load(); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function removeTx(tx: PlatformTransaction) {
    if (!(await confirm({ title: t("tx.delete") + "?", message: t("tx.deleteMsg"), danger: true, confirmLabel: t("tx.delete") }))) return;
    setBusy(true);
    try {
      await fetch(`/api/platform/transactions/${tx.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } })
        .then((r) => { if (!r.ok) throw new Error(r.statusText); });
      notify(t("tx.deleted")); setOpenId(null); load();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function downloadInvoice(tx: PlatformTransaction) {
    try {
      const r = await fetch(`/api/platform/transactions/${tx.id}/invoice`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error(await r.text());
      const wnd = window.open("", "_blank");
      if (wnd) { wnd.document.write(await r.text()); wnd.document.close(); }
    } catch (e) { notify(String(e), "error"); }
  }

  const cards = [
    { label: t("tx.pending"), value: summary.pending ?? 0, Icon: Clock },
    { label: t("tx.approvedMonth"), value: summary.approved_month ?? 0, Icon: Check },
    { label: t("tx.valueMonth"), value: rp(Number(summary.amount_month ?? 0)), Icon: Wallet },
    { label: t("tx.trials"), value: summary.trials_approved ?? 0, Icon: Zap },
  ];

  return (
    <PageBody wide fill>
      {ToastHost}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11.5px] text-muted-foreground mb-0.5 flex items-center gap-1.5"><c.Icon className="w-3.5 h-3.5" />{c.label}</p>
            <p className="text-[20px] font-bold tabular-nums text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      <SettingsCard className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[15px] font-bold text-foreground">{t("tx.title")}</p>
            <p className="text-[12.5px] text-muted-foreground">{t("tx.subtitle")}</p>
          </div>
          <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(0); }} align="right" />
        </div>
        {rows === null ? (
          <div className="h-32 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-10">{t("tx.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto flex-1 min-h-0">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] uppercase tracking-wide text-muted-foreground border-y border-border bg-muted/30">
                    <th className="px-4 py-2 w-[52px]">{t("tx.no")}</th>
                    <th className="px-3 py-2">{t("tx.request")}</th>
                    <th className="px-3 py-2">{t("tx.package")}</th>
                    <th className="px-3 py-2 hidden lg:table-cell">{t("tx.invoiceCol")}</th>
                    <th className="px-3 py-2 hidden md:table-cell">{t("tx.contact")}</th>
                    <th className="px-3 py-2 text-right">{t("tx.amount")}</th>
                    <th className="px-3 py-2">{t("tx.statusCol")}</th>
                    <th className="px-3 py-2 hidden sm:table-cell">{t("tx.date")}</th>
                    <th className="px-3 py-2 text-right">{t("tx.actionCol")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paged.map((tx, i) => (
                    <tr key={tx.id} onClick={() => { setOpenId(tx.id); setTopupOrg(tx.organization_id || ""); }}
                      className="cursor-pointer hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{page * PER_PAGE + i + 1}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-foreground truncate block max-w-[240px]">
                          {tx.type === "signup" ? (tx.org_name || t("tx.noName")) : t("tx.topupCredits", { n: tx.credits })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-muted text-[10.5px] font-bold uppercase text-muted-foreground whitespace-nowrap">
                          {tx.package_name || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell tabular-nums text-muted-foreground whitespace-nowrap">
                        {tx.invoice_no ? `INV-${tx.invoice_no}` : "-"}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground truncate max-w-[220px]">{tx.contact_email}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{tx.amount > 0 ? rp(tx.amount) : t("tx.free")}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-bold uppercase",
                          tx.status === "pending" ? "bg-amber-500/10 text-amber-600"
                            : tx.status === "approved" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(tx.created_at)}</td>
                      {/* Aksi: approve ceklis langsung di row (permintaan eksplisit),
                          sisanya (view / bukti / delete) di menu 3-dot. stopPropagation
                          supaya klik aksi tidak ikut membuka panel detail. */}
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          {tx.status === "pending" && (
                            <button title={t("tx.approve")} disabled={busy}
                              onClick={() => {
                                // Top-up butuh pilih organisasi dulu, jadi buka panelnya.
                                if (tx.type === "topup" && !tx.organization_id) { setOpenId(tx.id); setTopupOrg(""); return; }
                                setTopupOrg(tx.organization_id || ""); approve(tx);
                              }}
                              className="p-1 rounded-md border border-emerald-600/40 text-emerald-600 hover:bg-emerald-500/10 outline-none transition-colors disabled:opacity-40">
                              <Check className="w-[16px] h-[16px]" />
                            </button>
                          )}
                          <TxRowMenu
                            isOpen={menuId === tx.id}
                            onToggle={() => setMenuId(menuId === tx.id ? null : tx.id)}
                            onClose={() => setMenuId(null)}
                            onView={() => { setMenuId(null); setOpenId(tx.id); setTopupOrg(tx.organization_id || ""); }}
                            proofUrl={tx.payment_proof_url || ""}
                            onDelete={() => { setMenuId(null); removeTx(tx); }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-[12.5px] text-muted-foreground">
              <span className="tabular-nums">{t("tx.pageOf", { a: page + 1, b: totalPages })}</span>
              {/* Nomor halaman eksplisit, bukan cuma Prev/Next: operator lompat
                  langsung ke halaman yang dia mau. Maks 7 tombol, sisanya elipsis. */}
              <div className="flex items-center gap-1">
                <button disabled={page <= 0} onClick={() => setPage(page - 1)}
                  className="px-2 h-7 rounded-md border border-border font-semibold disabled:opacity-30 hover:bg-muted outline-none">&lsaquo;</button>
                {Array.from({ length: totalPages }, (_, i) => i)
                  .filter((i) => totalPages <= 7 || i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1)
                  .reduce<(number | "gap")[]>((acc, i, idx, arr) => {
                    if (idx > 0 && i - (arr[idx - 1] as number) > 1) acc.push("gap");
                    acc.push(i); return acc;
                  }, [])
                  .map((i, idx) => i === "gap"
                    ? <span key={`g${idx}`} className="px-1">&hellip;</span>
                    : (
                      <button key={i} onClick={() => setPage(i)}
                        className={cn("min-w-7 h-7 px-1.5 rounded-md border text-[12px] font-semibold tabular-nums outline-none",
                          i === page ? "border-primary bg-primary text-white" : "border-border hover:bg-muted")}>
                        {i + 1}
                      </button>
                    ))}
                <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
                  className="px-2 h-7 rounded-md border border-border font-semibold disabled:opacity-30 hover:bg-muted outline-none">&rsaquo;</button>
              </div>
            </div>
          </>
        )}
      </SettingsCard>

      {open && (
        <SidePanel open title={t("tx.detail")} onClose={() => setOpenId(null)} width="md">
          <div className="flex flex-col gap-4 p-4">
            <div>
              <p className="text-[15px] font-bold text-foreground">
                {open.type === "signup" ? (open.org_name || t("tx.noName")) : t("tx.topupCredits", { n: open.credits })}
              </p>
              <p className="text-[12.5px] text-muted-foreground">{open.contact_name} &middot; {open.contact_email}{open.contact_phone ? ` · ${open.contact_phone}` : ""}</p>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <Meta k={t("tx.package")} v={open.package_name} />
              {open.type === "signup" && <Meta k={t("tx.seats")} v={String(open.seats ?? 1)} />}
              <Meta k={t("tx.credits")} v={String(open.credits)} />
              <Meta k={t("tx.amount")} v={open.amount > 0 ? rp(open.amount) : t("tx.free")} />
              <Meta k={t("tx.date")} v={fmtDateTimeShort(open.created_at)} />
              {open.org_linked_name && <Meta k={t("tx.orgCreated")} v={open.org_linked_name} />}
            </div>
            {open.note && <p className="text-[12.5px] text-muted-foreground italic">&ldquo;{open.note}&rdquo;</p>}

            {/* Bukti transfer */}
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground mb-1.5">{t("tx.proof")}</p>
              {open.payment_proof_url ? (
                <a href={open.payment_proof_url} target="_blank" rel="noreferrer" className="block group">
                  {open.payment_proof_url.toLowerCase().includes(".pdf") ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-primary font-semibold"><FileText className="w-4 h-4" />PDF <ExternalLink className="w-3 h-3" /></span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={open.payment_proof_url} alt="" className="max-h-56 rounded-lg border border-border group-hover:opacity-90" />
                  )}
                </a>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">{t("tx.noProof")}</p>
              )}
            </div>

            {/* Invoice: preview + download setelah approved */}
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground mb-1.5">{t("tx.invoice")}</p>
              {open.status === "approved" && open.invoice_no ? (
                <div className="flex flex-col gap-2">
                  {invoiceHTML && (
                    <iframe title={t("tx.invoicePreview")} srcDoc={invoiceHTML}
                      className="w-full h-[320px] rounded-lg border border-border bg-white" />
                  )}
                  <button onClick={() => downloadInvoice(open)}
                    className="inline-flex w-fit items-center gap-1.5 px-3 h-8 rounded-md border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">
                    <FileText className="w-3.5 h-3.5" />{t("tx.downloadInvoice")} (INV-{open.invoice_no})
                  </button>
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">{t("tx.invoiceAfterApprove")}</p>
              )}
            </div>

            <button onClick={() => removeTx(open)} disabled={busy}
              className="self-start text-[12.5px] font-semibold text-destructive hover:underline outline-none">
              {t("tx.delete")}
            </button>

            {open.status === "pending" && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                {open.type === "topup" && (
                  <Select value={topupOrg} onChange={setTopupOrg} options={orgOptions} placeholder={t("tx.pickOrg")} />
                )}
                <div className="flex gap-2">
                  <button onClick={() => approve(open)} disabled={busy || (open.type === "topup" && !topupOrg)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t("tx.approve")}
                  </button>
                  <button onClick={() => reject(open)} disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-border text-[13px] font-semibold text-destructive hover:bg-muted outline-none">
                    <X className="w-4 h-4" />{t("tx.reject")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </SidePanel>
      )}
    </PageBody>
  );
}

// Menu 3-dot per row, portal ke body seperti UserRowMenu di user-management:
// tabel di-overflow container, popover biasa bakal kepotong.
function TxRowMenu({ isOpen, onToggle, onClose, onView, proofUrl, onDelete }: {
  isOpen: boolean; onToggle: () => void; onClose: () => void;
  onView: () => void; proofUrl: string; onDelete: () => void;
}) {
  const { t } = useI18n();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false });

  const handleToggle = () => {
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const flipUp = window.innerHeight - rect.bottom < 140;
      setPos({ top: flipUp ? rect.top : rect.bottom + 4, left: rect.right - 176, flipUp });
    }
    onToggle();
  };

  return (
    <>
      <button ref={btnRef} aria-label={t("tx.actionCol")} onClick={handleToggle}
        className="p-1 border border-border rounded-md hover:bg-muted transition-colors outline-none">
        <MoreHorizontal className="w-[16px] h-[16px] text-muted-foreground" />
      </button>
      {isOpen && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={onClose} />
          <div className="fixed z-[70] w-44 bg-card rounded-lg border border-border shadow-lg py-1 animate-scale-in"
            style={pos.flipUp ? { bottom: window.innerHeight - pos.top, left: pos.left } : { top: pos.top, left: pos.left }}>
            <button onClick={onView} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted outline-none transition-colors">
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />{t("tx.view")}
            </button>
            {proofUrl && (
              <button onClick={() => { onClose(); window.open(proofUrl, "_blank", "noreferrer"); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted outline-none transition-colors">
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />{t("tx.viewProof")}
              </button>
            )}
            <div className="border-t border-border my-0.5" />
            <button onClick={onDelete} className="w-full px-3 py-2 text-left text-[13px] text-destructive hover:bg-muted outline-none transition-colors">
              {t("tx.delete")}
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{k}</p>
      <p className="font-semibold text-foreground capitalize">{v}</p>
    </div>
  );
}
