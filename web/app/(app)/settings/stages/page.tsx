"use client";
// Pipeline Stages — owner/admin manage the sales pipeline: rename, reorder, add
// custom stages, delete custom ones. Default (system) stages are translated
// automatically per language; renaming one turns it into a fixed custom name.
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, Lock } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { cn, stageLabel } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import enLocale from "@/locales/en.json";
import { Tip } from "@/components/ui/tooltip";
import SidePanel from "@/components/SidePanel";
import type { Stage } from "@/lib/types";
import { useToast, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";

const EN_STAGES = (enLocale as { stages?: Record<string, string> }).stages || {};
const isLost = (s: Stage) => !!s.system_key && s.system_key.startsWith("lost");
const isSystem = (s: Stage) => !!s.system_key;
// A pristine system stage still holds its English canonical name (so it translates).
const isPristine = (s: Stage) => !!s.system_key && EN_STAGES[s.system_key] === s.name;

export default function StagesPage() {
  const { t } = useI18n();
  const { notify, confirm, ToastHost } = useToast();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<{ open: boolean; editing: Stage | null }>({ open: false, editing: null });

  const role = getUser()?.role;
  const canEdit = role === "owner" || role === "admin";

  async function load() {
    setLoading(true);
    try { setStages(await api.listStages()); }
    catch { /* auth handled in api */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Pipeline = the ordered selling stages; Outcome = terminal lost stages (kept
  // at the bottom, not reorderable/deletable).
  const pipeline = useMemo(() => stages.filter((s) => !isLost(s)), [stages]);
  const outcome = useMemo(() => stages.filter((s) => isLost(s)), [stages]);

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= pipeline.length || busy) return;
    const arr = [...pipeline];
    [arr[index], arr[j]] = [arr[j], arr[index]];
    setStages([...arr, ...outcome]); // optimistic
    setBusy(true);
    try { await api.reorderStages(arr.map((s) => s.id)); }
    catch (e) { notify(String(e), "error"); load(); }
    finally { setBusy(false); }
  }

  async function remove(s: Stage) {
    if (!(await confirm({ title: "Delete stage?", message: `Delete "${stageLabel(t, s)}"? Leads at this stage will have no stage.`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.deleteStage(s.id); notify(t("settings.stageDeleted")); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  const Row = ({ s, index, list }: { s: Stage; index: number; list: Stage[] }) => { const { t } = useI18n(); return ((
    <tr className="border-b border-border/60 hover:bg-muted/50 transition-colors">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{stageLabel(t, s)}</span>
          {isSystem(s) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
              {isPristine(s) ? t("settings.default") : t("settings.renamed")}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {canEdit ? (
          <div className="inline-flex items-center gap-0.5">
            {!isLost(s) && (
              <>
                <Tip label={t("settings.moveUp")}><button disabled={index === 0 || busy} onClick={() => move(index, -1)} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-25 outline-none text-muted-foreground"><ArrowUp className="w-4 h-4" /></button></Tip>
                <Tip label={t("settings.moveDown")}><button disabled={index === list.length - 1 || busy} onClick={() => move(index, 1)} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-25 outline-none text-muted-foreground"><ArrowDown className="w-4 h-4" /></button></Tip>
              </>
            )}
            <Tip label={t("settings.rename")}><button onClick={() => setDlg({ open: true, editing: s })} className="p-1.5 rounded-md hover:bg-muted outline-none text-muted-foreground hover:text-foreground"><Pencil className="w-[17px] h-[17px]" /></button></Tip>
            {isSystem(s)
              ? <Tip label={t("settings.defaultStagesCanTBe")}><span className="inline-flex p-1.5 text-muted-foreground/40"><Lock className="w-[16px] h-[16px]" /></span></Tip>
              : <Tip label={t("common.delete")}><button onClick={() => remove(s)} className="p-1.5 rounded-md hover:bg-red-50 outline-none text-red-500"><Trash2 className="w-[17px] h-[17px]" /></button></Tip>}
          </div>
        ) : <span className="text-muted-foreground/50 text-xs">-</span>}
      </td>
    </tr>
  )); };

  const Section = ({ title, subtitle, list }: { title: string; subtitle: string; list: Stage[] }) => { const { t } = useI18n(); return ((
    <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="font-bold text-[14px] text-foreground leading-tight">{title}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {list.length === 0
            ? <tr><td className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t("settings.noStages")}</td></tr>
            : list.map((s, i) => <Row key={s.id} s={s} index={i} list={list} />)}
        </tbody>
      </table>
    </div>
  )); };

  return (
    <div className="px-6 py-6 w-full h-full overflow-auto">
      {ToastHost}
      <div className="w-full flex flex-col gap-5">
        {canEdit && (
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setDlg({ open: true, editing: null })}><Plus className="w-4 h-4" />{t("settings.addStage")}</PrimaryButton>
          </div>
        )}
        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></div>
        ) : (
          <>
            <Section title={t("settings.pipeline")} subtitle={t("settings.theSellingStagesALead")} list={pipeline} />
            <Section title={t("settings.outcomes")} subtitle={t("settings.terminalLostStagesTheseAlways")} list={outcome} />
            {!canEdit && <p className="text-[12px] text-muted-foreground text-center">{t("settings.onlyAnOwnerOrAdmin")}</p>}
          </>
        )}
      </div>

      {dlg.open && canEdit && <StageDialog editing={dlg.editing} count={pipeline.length}
        onClose={() => setDlg({ open: false, editing: null })}
        onSaved={(m) => { setDlg({ open: false, editing: null }); notify(m); load(); }}
        onError={(m) => notify(m, "error")} />}
    </div>
  );
}

function StageDialog({ editing, count, onClose, onSaved, onError }: {
  editing: Stage | null; count: number;
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const { t } = useI18n();
  const isEdit = !!editing;
  const system = editing ? isSystem(editing) : false;
  const pristine = editing ? isPristine(editing) : false;
  // For a system stage, the "custom name" is empty while pristine (so it keeps
  // translating); once set, it overrides the translated default.
  const [name, setName] = useState(isEdit && !(system && pristine) ? editing!.name : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      if (isEdit) {
        if (system) {
          // Empty custom name -> revert to the canonical English so it translates.
          const next = name.trim() || (EN_STAGES[editing!.system_key!] ?? editing!.name);
          await api.updateStage(editing!.id, { name: next });
        } else {
          if (!name.trim()) { onError(t("account.name_required")); setSaving(false); return; }
          await api.updateStage(editing!.id, { name: name.trim() });
        }
        onSaved(t("settings.stageUpdated"));
      } else {
        if (!name.trim()) { onError(t("account.name_required")); setSaving(false); return; }
        await api.createStage({ name: name.trim(), sort_order: count + 1 });
        onSaved(t("settings.stageCreated"));
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <SidePanel
      open onClose={onClose}
      title={isEdit ? t("settings.renameStage") : t("settings.newStage")}
      width="sm" busy={saving} onApply={save}
      applyLabel={isEdit ? "Save" : "Create"}
    >
      <div className="flex flex-col gap-4">
        {system && (
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5">
            <p className="text-[12px] font-semibold text-foreground">{t("settings.defaultStage")} {t(`stages.${editing!.system_key}`)}</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">{t("settings.leaveTheCustomNameEmpty")}</p>
          </div>
        )}
        <div>
          <FieldLabel>{system ? t("settings.customNameOptional") : t("inbox.name")}</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder={system ? stageLabel(t, editing!) : t("settings.eGTestDrive")} className={INPUT_CLASS} />
        </div>
      </div>
    </SidePanel>
  );
}
