"use client";
import { useI18n } from "@/lib/i18n";
// Enterprise campaign wizard: Campaign basics -> Branches -> Review. A campaign
// is a group (e.g. "UMC"); branches are its sub-units (offices/stores), each with
// its own coverage, ad sources and agents. Leads route by ad source to a branch,
// else fall back to the campaign's default agents.
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Phone, PhoneOff, Sparkles, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import type { UserAccount, Channel, WebApiSource } from "@/lib/types";
import { Select } from "@/components/Select";
import { AgentMultiSelect } from "@/components/AgentMultiSelect";
import MultiSelectFilter from "@/app/(app)/inbox/components/MultiSelectFilter";
import { WizardModal, WizardField, BackButton, ContinueButton } from "../channels/WizardModal";
import { FieldLabel, PrimaryButton, InfoHint } from "../_shared";

const STEPS = ["Campaign", "Branches", "Review"];

const SEGMENTS = [
  "Automotive", "Property / Real Estate", "Finance", "Insurance", "Retail / FMCG",
  "Education", "Healthcare", "Travel & Hospitality", "Food & Beverage", "Services", "Other",
];

type LocalBranch = {
  key: string; id?: string;
  name: string; adSources: string;
  agentIds: string[]; supervisorIds: string[]; webSourceIds: string[];
};

let keySeq = 0;
const newBranch = (): LocalBranch => ({ key: `b${++keySeq}`, name: "", adSources: "", agentIds: [], supervisorIds: [], webSourceIds: [] });
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function CampaignWizard({ campaignId, users, channels, onClose, onDone, onError }: {
  campaignId: string | null; users: UserAccount[]; channels: Channel[];
  onClose: () => void; onDone: (msg: string) => void; onError: (msg: string) => void;
}) {
  const { t } = useI18n();
  const isEdit = !!campaignId;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Campaign basics
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("active");
  const [routing, setRouting] = useState("round_robin");
  const [channelId, setChannelId] = useState("");
  const [callingEnabled, setCallingEnabled] = useState(true);
  const [defaultAgents, setDefaultAgents] = useState<string[]>([]);
  const [supervisors, setSupervisors] = useState<string[]>([]);
  const [adSources, setAdSources] = useState("");
  const [keywords, setKeywords] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState(""); // monthly ad budget (Rp) for budget utilization
  const [followupTpl, setFollowupTpl] = useState(""); // approved template for out-of-window follow-ups
  const [templates, setTemplates] = useState<{ id: string; name: string; language: string }[]>([]);

  // AI assistant
  const [segment, setSegment] = useState("");
  const [brand, setBrand] = useState("");
  const [aiAutoReply, setAiAutoReply] = useState(false);
  const [aiLanguage, setAiLanguage] = useState("id");
  const [aiDynamicLanguage, setAiDynamicLanguage] = useState(true);
  const [intakeFormId, setIntakeFormId] = useState("");
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);

  // Branches
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [webSources, setWebSources] = useState<WebApiSource[]>([]);

  const agentOptions = users.map((u) => ({ id: u.id, name: u.full_name }));
  const webSourceOptions = webSources.map((s) => ({ value: s.id, label: s.name }));

  useEffect(() => {
    api.listWebApiSources().then(setWebSources).catch(() => {});
    api.listFlows().then((fs) => setForms((fs || []).map((f) => ({ id: f.id, name: f.name })))).catch(() => {});
    api.listTemplates().then((t) => setTemplates((t || []).filter((x) => x.status === "APPROVED").map((x) => ({ id: x.id, name: x.name, language: x.language })))).catch(() => {});
    if (campaignId) {
      Promise.all([api.getCampaign(campaignId), api.listCampaignBranches(campaignId).catch(() => [])])
        .then(([c, brs]) => {
          setName(c.name); setCompany(c.dealer_name ?? ""); setStatus(c.status); setRouting(c.routing_strategy);
          setChannelId(c.channel_id ?? ""); setCallingEnabled(c.calling_enabled ?? true);
          setDefaultAgents(c.agent_ids ?? []); setSupervisors(c.supervisor_ids ?? []); setKeywords((c.keywords ?? []).join(", "));
          setAdSources((c.ad_source_ids ?? []).join(", "));
          setSegment(c.segment ?? ""); setBrand(c.brand ?? ""); setAiAutoReply(c.ai_auto_reply ?? false);
          setAiLanguage(c.ai_language ?? "id"); setAiDynamicLanguage(c.ai_dynamic_language ?? true); setIntakeFormId(c.intake_form_id ?? "");
          setMonthlyBudget(c.monthly_budget != null ? String(c.monthly_budget) : "");
          setFollowupTpl(c.followup_template_id ?? "");
          setBranches((brs as any[]).map((b) => ({
            key: `b${++keySeq}`, id: b.id, name: b.name,
            adSources: (b.ad_source_ids ?? []).join(", "), agentIds: b.agent_ids ?? [], supervisorIds: b.supervisor_ids ?? [], webSourceIds: b.web_source_ids ?? [],
          })));
        })
        .catch((e) => onError(String(e)));
    }
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchBranch(key: string, patch: Partial<LocalBranch>) {
    setBranches((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }
  function removeBranch(b: LocalBranch) {
    if (b.id) setRemoved((r) => [...r, b.id!]);
    setBranches((bs) => bs.filter((x) => x.key !== b.key));
  }

  async function submit() {
    if (!name.trim()) { setStep(0); onError(t("settings.campaignNameIsRequired")); return; }
    if (branches.some((b) => !b.name.trim())) { onError(t("settings.everyBranchNeedsAName")); return; }
    // One ad source ID must belong to a single branch: the same ID in two branches
    // misroutes leads (one arbitrary branch wins) and breaks per-branch reporting.
    const seenAd = new Map<string, string>(); // ad id -> branch key
    for (const b of branches) {
      for (const id of csv(b.adSources)) {
        const key = id.toLowerCase();
        const prev = seenAd.get(key);
        if (prev && prev !== b.key) { setStep(1); onError(`Ad source ID "${id}" is in more than one branch. Each ad ID must belong to a single branch.`); return; }
        if (!prev) seenAd.set(key, b.key);
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(), dealer_name: company.trim(), status, routing_strategy: routing,
        channel_id: channelId, ad_source_ids: csv(adSources), keywords: csv(keywords),
        agent_ids: defaultAgents, supervisor_ids: supervisors, calling_enabled: callingEnabled,
        segment, brand: brand.trim(), ai_auto_reply: aiAutoReply, ai_language: aiLanguage,
        ai_dynamic_language: aiDynamicLanguage, intake_form_id: intakeFormId || "none",
        monthly_budget: monthlyBudget.trim() === "" ? null : Number(monthlyBudget.replace(/[^0-9.]/g, "")),
        followup_template_id: followupTpl || "none",
      };
      let cid = campaignId;
      if (isEdit) await api.updateCampaign(cid!, payload);
      else cid = (await api.createCampaign(payload)).id;

      for (const id of removed) await api.deleteBranch(id);
      for (const b of branches) {
        const input = { name: b.name.trim(), ad_source_ids: csv(b.adSources), agent_ids: b.agentIds, supervisor_ids: b.supervisorIds, web_source_ids: b.webSourceIds };
        if (b.id) await api.updateBranch(b.id, input);
        else await api.createBranch(cid!, input);
      }
      onDone(isEdit ? "Campaign updated" : "Campaign created");
    } catch (e) { onError(String(e)); setSaving(false); }
  }

  const footer =
    step === 0 ? (<><div className="flex-1" /><ContinueButton onClick={() => name.trim() && setStep(1)} disabled={!name.trim()} /></>)
    : step === 1 ? (<><BackButton onClick={() => setStep(0)} /><div className="flex-1" /><ContinueButton onClick={() => setStep(2)} /></>)
    : (<><BackButton onClick={() => setStep(1)} /><div className="flex-1" />
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{isEdit ? t("settings.saveCampaign") : t("settings.createCampaign")}</PrimaryButton></>);

  const channel = channels.find((c) => c.id === channelId);

  return (
    <WizardModal title={isEdit ? t("settings.editCampaign") : t("settings.newCampaign")} icon={<Building2 className="w-5 h-5" />} steps={STEPS} step={step} onClose={onClose} footer={footer} maxWidth={820}>
      {/* Step 0 — Campaign */}
      {step === 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <WizardField label={t("settings.campaignName")} value={name} onChange={setName} placeholder={t("settings.eGUmc")} autoFocus />
            <WizardField label={t("settings.companyGroupOptional")} value={company} onChange={setCompany} placeholder={t("settings.eGUnitedMotors")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><FieldLabel>{t("automation.status")}</FieldLabel><Select value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }]} /></div>
            <div><FieldLabel>{t("settings.routing")}</FieldLabel><Select value={routing} onChange={setRouting} options={[{ value: "round_robin", label: "Round-robin" }, { value: "manual", label: "Manual" }]} /></div>
          </div>
          <div>
            <FieldLabel>{t("components.channel")}</FieldLabel>
            <Select value={channelId} onChange={setChannelId} placeholder={t("settings.noChannel")}
              options={[{ value: "", label: "No channel" }, ...channels.map((ch) => ({ value: ch.id, label: ch.name + (ch.calling_enabled ? "  (calling enabled)" : "") }))]} />
            {channelId && channel?.calling_enabled && (
              <div className="flex items-center justify-between gap-3 mt-2 rounded-lg border border-border p-3">
                <p className="text-[13px] font-semibold text-foreground inline-flex items-center gap-1.5">{callingEnabled ? <Phone className="w-3.5 h-3.5 text-success" /> : <PhoneOff className="w-3.5 h-3.5 text-muted-foreground" />} {t("settings.enableCalling")}</p>
                <button type="button" onClick={() => setCallingEnabled((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors outline-none ${callingEnabled ? "bg-primary" : "bg-muted"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${callingEnabled ? "translate-x-[18px] ml-0.5" : "translate-x-0.5"}`} />
                </button>
              </div>
            )}
            {!channelId && <p className="mt-1 text-[11px] text-amber-600">{t("settings.noChannelSetLeadsWon")}</p>}
          </div>
          <div>
            <FieldLabel hint={t("settings.roundRobinUsedWhenNo")}>{t("settings.defaultAgents")}</FieldLabel>
            <AgentMultiSelect options={agentOptions} selected={defaultAgents} onChange={setDefaultAgents} />
          </div>
          <div>
            <FieldLabel hint={t("settings.managersSpvWhoCanSee")}>{t("settings.supervisorsViewOnlyNoLeads")}</FieldLabel>
            <AgentMultiSelect options={agentOptions} selected={supervisors} onChange={setSupervisors} />
          </div>
          <WizardField label={t("settings.ctwaAdSourceIdsUsed")} value={adSources} onChange={setAdSources} placeholder="ad_honda_brio_2026" hint={t("settings.perBranchAdSourcesAre")} />
          <WizardField label={t("settings.keywordsInFirstMessageComma")} value={keywords} onChange={setKeywords} placeholder={t("settings.brioHonda")} />
          <WizardField label={t("settings.totalBudgetRpOptional")} value={monthlyBudget} onChange={(v) => setMonthlyBudget(v.replace(/[^0-9.]/g, ""))} placeholder="200000000" hint={t("settings.totalAdBudgetForThis")} />

          {/* AI Assistant */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 border-b border-border">
              <div className="inline-flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-[13.5px] font-semibold text-foreground">{t("settings.aiAssistant")}</span>
                <InfoHint text={t("settings.whenOnTheAiReplies")} />
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="text-[12px] font-medium text-muted-foreground">{aiAutoReply ? t("settings.autoReplyOn") : t("settings.autoReplyOff")}</span>
                <button type="button" onClick={() => setAiAutoReply((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors outline-none ${aiAutoReply ? "bg-primary" : "bg-muted"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${aiAutoReply ? "translate-x-[18px] ml-0.5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>{t("settings.segment")}</FieldLabel>
                  <Select value={segment} onChange={setSegment} placeholder={t("settings.selectSegment")} searchable
                    options={[{ value: "", label: "Not set" }, ...SEGMENTS.map((s) => ({ value: s, label: s }))]} /></div>
                <WizardField label={t("components.brand")} value={brand} onChange={setBrand} placeholder={t("settings.eGMitsubishiXforce")} hint={t("settings.givesTheAiClearContext")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>{t("settings.replyLanguage")}</FieldLabel>
                  <Select value={aiLanguage} onChange={setAiLanguage} searchable={false}
                    options={[{ value: "id", label: "Indonesian" }, { value: "en", label: "English" }]} /></div>
                <div className="flex items-end">
                  <div className="flex items-center justify-between gap-3 w-full rounded-lg border border-border p-3">
                    <p className="text-[13px] font-medium text-foreground">{t("settings.matchContactSLanguage")}</p>
                    <button type="button" onClick={() => setAiDynamicLanguage((v) => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors outline-none ${aiDynamicLanguage ? "bg-primary" : "bg-muted"}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${aiDynamicLanguage ? "translate-x-[18px] ml-0.5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
              </div>
              <div><FieldLabel hint={t("settings.theAiSendsThisWhatsapp")}>{t("settings.intakeFormAutoSentOn")}</FieldLabel>
                <Select value={intakeFormId} onChange={setIntakeFormId} placeholder={t("settings.noForm")} searchable
                  options={[{ value: "", label: "No form" }, ...forms.map((f) => ({ value: f.id, label: f.name }))]} />
              </div>
              <div><FieldLabel hint={t("settings.approvedWhatsappTemplateForOut")}>{t("settings.followUpTemplate")}</FieldLabel>
                <Select value={followupTpl} onChange={setFollowupTpl} placeholder={t("components.none")} searchable
                  options={[{ value: "", label: "None (skip out-of-window follow-ups)" }, ...templates.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }))]} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1 — Branches */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted-foreground">
            {t("settings.branchesAreSubUnitsOf")}
          </p>
          {branches.map((b, i) => (
            <div key={b.key} className="rounded-lg border border-border p-4 flex flex-col gap-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <input value={b.name} onChange={(e) => patchBranch(b.key, { name: e.target.value })} placeholder={`Branch ${i + 1} name (e.g. Bekasi)`}
                  className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm font-semibold outline-none focus:border-primary" />
                <button type="button" onClick={() => removeBranch(b)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive outline-none"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div>
                <FieldLabel>{t("settings.ctwaAdSourceIdsComma")}</FieldLabel>
                <input value={b.adSources} onChange={(e) => patchBranch(b.key, { adSources: e.target.value })} placeholder="ad_umc_bekasi"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <FieldLabel>{t("settings.webApiSources")}</FieldLabel>
                <MultiSelectFilter variant="field" label={t("settings.webSources")} options={webSourceOptions} selected={b.webSourceIds} onChange={(v) => patchBranch(b.key, { webSourceIds: v })} />
              </div>
              <div>
                <FieldLabel>{t("settings.agentsRoundRobin")}</FieldLabel>
                <AgentMultiSelect options={agentOptions} selected={b.agentIds} onChange={(v) => patchBranch(b.key, { agentIds: v })} />
              </div>
              <div>
                <FieldLabel>{t("settings.supervisorsViewOnlyNoLeads")}</FieldLabel>
                <AgentMultiSelect options={agentOptions} selected={b.supervisorIds} onChange={(v) => patchBranch(b.key, { supervisorIds: v })} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setBranches((bs) => [...bs, newBranch()])}
            className="inline-flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-border text-sm font-semibold text-foreground/80 hover:border-primary/40 hover:bg-muted/40 transition-colors outline-none">
            <Plus className="w-4 h-4" />{t("settings.addBranch")}
          </button>
        </div>
      )}

      {/* Step 2 — Review */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("automation.campaign")}</p>
            <p className="text-[15px] font-bold text-foreground">{name || "(unnamed)"}{company ? <span className="text-muted-foreground font-medium"> · {company}</span> : null}</p>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              {status} · {routing.replace("_", " ")} · {channel ? channel.name : t("settings.noChannel")} · {defaultAgents.length} {t("settings.defaultAgent")}{defaultAgents.length === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{branches.length} branch{branches.length === 1 ? "" : "es"}</p>
            {branches.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("settings.noBranchesLeadsRouteTo")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {branches.map((b) => (
                  <div key={b.key} className="rounded-lg border border-border p-3 flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground truncate">{b.name || "(unnamed)"}</p>
                      <p className="text-[11.5px] text-muted-foreground truncate">{b.agentIds.length} agent{b.agentIds.length === 1 ? "" : "s"} · {csv(b.adSources).length + b.webSourceIds.length} {t("settings.adSource")}{csv(b.adSources).length + b.webSourceIds.length === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </WizardModal>
  );
}
