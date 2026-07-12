"use client";
import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Plus, Zap, MessageCircle, FileText, User, Sparkles, Tag, Flag,
  Globe, GitFork, Trash2, Loader2, X, Save, Undo2, Redo2,
  Braces, ToggleRight, Sheet, ClipboardList, UserMinus, Ban,
  FolderMinus, Scissors, Mail, Milestone, Flame, Image as ImageIcon,
  RefreshCw, LayoutGrid,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import { Select } from "@/components/Select";

import { api } from "@/lib/api";
import { Toast as ToastView } from "@/components/Toast";
import { ACTIONS, TRIGGERS, eventLabel } from "@/lib/automationMeta";
import { cn } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import type { AutomationDetail } from "@/lib/types";

// ── Node catalog ────────────────────────────────────────────────────────────
type Meta = { label: string; Icon: LucideIcon; accent: string; kicker: string; desc: string };
const META: Record<string, Meta> = {
  trigger: { label: "Trigger", Icon: Zap, accent: "#F59E0B", kicker: "WHEN", desc: "A conditional entry point - adds a keyword branch" },
  condition: { label: "Criteria Router", Icon: GitFork, accent: "#8B5CF6", kicker: "IF", desc: "Branch on a contact attribute (match / else)" },
  send_message: { label: "Send auto reply", Icon: MessageCircle, accent: "#2D8B73", kicker: "DO", desc: ACTIONS.send_message.desc },
  send_template: { label: "Send template", Icon: FileText, accent: "#2D8B73", kicker: "DO", desc: ACTIONS.send_template.desc },
  send_form: { label: "Send WhatsApp Form", Icon: ClipboardList, accent: "#2D8B73", kicker: "DO", desc: ACTIONS.send_form.desc },
  assign_agent: { label: "Assign to team member", Icon: User, accent: "#0891B2", kicker: "DO", desc: ACTIONS.assign_agent.desc },
  unassign_team: { label: "Unassign from team", Icon: UserMinus, accent: "#0891B2", kicker: "DO", desc: ACTIONS.unassign_team.desc },
  assign_campaign: { label: "Add to campaign", Icon: Sparkles, accent: "#0891B2", kicker: "DO", desc: ACTIONS.assign_campaign.desc },
  remove_campaign: { label: "Remove from campaign", Icon: FolderMinus, accent: "#0891B2", kicker: "DO", desc: ACTIONS.remove_campaign.desc },
  blacklist: { label: "Mark blacklisted", Icon: Ban, accent: "#DC2626", kicker: "DO", desc: ACTIONS.blacklist.desc },
  send_email: { label: "Send email notification", Icon: Mail, accent: "#2563EB", kicker: "DO", desc: ACTIONS.send_email.desc },
  add_tag: { label: "Add tag", Icon: Tag, accent: "#D97706", kicker: "DO", desc: ACTIONS.add_tag.desc },
  remove_tag: { label: "Remove tag", Icon: Scissors, accent: "#D97706", kicker: "DO", desc: ACTIONS.remove_tag.desc },
  set_contact_attribute: { label: "Set contact attribute", Icon: Braces, accent: "#7C3AED", kicker: "DO", desc: ACTIONS.set_contact_attribute.desc },
  set_priority: { label: "Set priority", Icon: Flag, accent: "#DC2626", kicker: "DO", desc: ACTIONS.set_priority.desc },
  set_stage: { label: "Set stage", Icon: Milestone, accent: "#7C3AED", kicker: "DO", desc: ACTIONS.set_stage.desc },
  set_interest: { label: "Set interest level", Icon: Flame, accent: "#DC2626", kicker: "DO", desc: ACTIONS.set_interest.desc },
  set_conversation_status: { label: "Set conversation status", Icon: ToggleRight, accent: "#475569", kicker: "DO", desc: ACTIONS.set_conversation_status.desc },
  google_sheet: { label: "Add row to Google Sheet", Icon: Sheet, accent: "#059669", kicker: "DO", desc: ACTIONS.google_sheet.desc },
  webhook_notify: { label: "Webhook", Icon: Globe, accent: "#475569", kicker: "DO", desc: ACTIONS.webhook_notify.desc },
  rest_api: { label: "Call REST API", Icon: Globe, accent: "#475569", kicker: "DO", desc: ACTIONS.rest_api.desc },
};
const meta = (k: string) => META[k] ?? META.send_message;

const PALETTE: { group: string; kinds: string[] }[] = [
  { group: "Triggers", kinds: ["trigger"] },
  { group: "Logic", kinds: ["condition"] },
  { group: "Messaging", kinds: ["send_message", "send_template", "send_form"] },
  { group: "Routing", kinds: ["assign_agent", "unassign_team", "assign_campaign", "remove_campaign"] },
  { group: "Contact", kinds: ["add_tag", "remove_tag", "set_contact_attribute", "set_stage", "set_interest", "set_priority", "blacklist"] },
  { group: "Flow control", kinds: ["set_conversation_status", "webhook_notify"] },
  { group: "Integrations", kinds: ["google_sheet", "send_email", "rest_api"] },
];
// The executor runs these; others are configurable but not yet executed.
const EXECUTED = new Set(["condition", "send_message", "send_template", "send_form", "add_tag", "remove_tag", "assign_agent", "unassign_team", "assign_campaign", "remove_campaign", "blacklist", "set_priority", "set_stage", "set_interest", "set_contact_attribute", "set_conversation_status", "google_sheet", "send_email", "webhook_notify", "rest_api"]);

type NodeData = { kind: string; config: Record<string, unknown>; triggerType?: string };
type AppNode = Node<NodeData>;

function summary(kind: string, c: Record<string, unknown>, triggerType?: string): string {
  switch (kind) {
    case "trigger": {
      const conds = Array.isArray(c.conditions) ? (c.conditions as Record<string, unknown>[]) : [];
      if (conds.length === 0) return TRIGGERS[triggerType ?? ""]?.desc ?? "Fires on the event";
      if (conds.length > 1) return `${conds.length} conditions (all match)`;
      const kws = Array.isArray(conds[0]?.keywords) ? (conds[0].keywords as string[]) : [];
      return kws.length ? kws.join(", ") : String(conds[0]?.type ?? "").replace(/_/g, " ");
    }
    case "send_message": {
      const inter = String(c.interactive ?? (c.message_type === "buttons" || c.message_type === "list" ? c.message_type : "none"));
      const parts: string[] = [];
      if (c.media_url) parts.push("Image");
      const body = String(c.body ?? c.message ?? "");
      if (body) parts.push(body.length > 28 ? body.slice(0, 28) + "…" : body);
      if (inter === "buttons") parts.push(`${Array.isArray(c.buttons) ? c.buttons.length : 0} button(s)`);
      if (inter === "list") { const s0 = (Array.isArray(c.sections) ? c.sections[0] : undefined) as { rows?: unknown[] } | undefined; parts.push(`list: ${(Array.isArray(s0?.rows) ? s0!.rows!.length : 0)} item(s)`); }
      return parts.join(" · ") || "No message set";
    }
    case "send_template": return `Template: ${c.template_name || "—"}`;
    case "send_form": return `Form: ${c.form_name || "—"}`;
    case "assign_agent": return `Agent: ${c.agent_name || c.agent_id || "—"}`;
    case "assign_campaign": return `Campaign: ${c.campaign_name || "—"}`;
    case "unassign_team": return "Clear assigned agent";
    case "remove_campaign": return "Clear campaign";
    case "blacklist": return "Block from outreach";
    case "send_email": return `Email to: ${c.to || "—"}`;
    case "set_contact_attribute": return `${(Array.isArray(c.mappings) ? c.mappings.length : (c.key ? 1 : 0))} attribute(s)`;
    case "add_tag": case "remove_tag": return `Tags: ${(Array.isArray(c.tags) ? (c.tags as string[]).join(", ") : "") || "—"}`;
    case "set_conversation_status": return `Status: ${c.status || "—"}`;
    case "set_stage": return `Stage: ${c.stage_name || "—"}`;
    case "set_interest": return `Interest: ${c.interest_level || "—"}`;
    case "google_sheet": return c.sheet_url ? "Append to sheet" : "No sheet set";
    case "set_priority": return `Priority: ${c.priority || "normal"}`;
    case "webhook_notify": return String(c.url || "No URL set");
    case "rest_api": return c.url ? `${String(c.method || "POST")} ${String(c.url)}` : "No URL set";
    case "condition": return c.attribute ? `${c.attribute} ${String(c.operator || "equals").replace(/_/g, " ")} ${c.value ?? ""}`.trim() : "Define condition";
    default: return ACTIONS[kind]?.desc ?? "";
  }
}
// Extract trigger keywords as array for pill rendering inside the node.
function triggerKeywords(c: Record<string, unknown>): string[] {
  const conds = Array.isArray(c.conditions) ? (c.conditions as Record<string, unknown>[]) : [];
  const all: string[] = [];
  for (const cond of conds) {
    const kws = Array.isArray(cond?.keywords) ? (cond.keywords as string[]) : [];
    all.push(...kws);
  }
  return all;
}

// ── Custom node ─────────────────────────────────────────────────────────────
function FlowNode({ data, selected }: NodeProps<AppNode>) {
  const { t } = useI18n();
  const m = meta(data.kind);
  const title = m.label;
  const isTrigger = data.kind === "trigger";
  const tKws = isTrigger ? triggerKeywords(data.config) : [];
  // Per-option source handles: an Auto Reply with reply buttons / a list gets one
  // source handle per option (handle id = its callback id) so each option can
  // branch to its own downstream node. walkFlow routes a tapped button to the
  // edge whose handle == the button's callback id.
  const inter = data.kind === "send_message"
    ? String(data.config.interactive ?? (data.config.message_type === "buttons" || data.config.message_type === "list" ? data.config.message_type : "none"))
    : "none";
  const rawOpts = inter === "buttons" ? data.config.buttons
    : inter === "list" ? (Array.isArray(data.config.sections) ? (data.config.sections[0] as { rows?: unknown[] } | undefined)?.rows : undefined)
    : undefined;
  const options: { id: string; title: string }[] = Array.isArray(rawOpts)
    ? (rawOpts as { id?: string; title?: string }[]).map((o, i) => ({ id: String(o?.id || o?.title || `opt${i}`), title: String(o?.title || `Option ${i + 1}`) }))
    : [];
  const nodeWidth = options.length > 0 ? Math.max(260, options.length * 100 + 40) : 260;
  return (
    <div className={cn(
      "rounded-lg bg-card border-[1.5px] shadow-sm transition-all",
      selected ? "border-primary/50 ring-1 ring-primary/15 shadow-md" : "border-border hover:border-primary/40 hover:shadow-md",
    )} style={{ width: nodeWidth }}>
      {!isTrigger && <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-muted-foreground !border-2 !border-card" />}
      <div className="p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: m.accent + "1a", color: m.accent }}>
            <m.Icon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold tracking-[0.09em]" style={{ color: m.accent }}>{m.kicker}</p>
            <p className="text-[13px] font-bold text-foreground leading-tight truncate">{t(title)}</p>
          </div>
          {!isTrigger && !EXECUTED.has(data.kind) && (
            <Tip label={t("automation.configurableNotYetExecutedBy")}><span className="text-[8.5px] font-bold uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">soon</span></Tip>
          )}
        </div>
        {/* Trigger keywords as pills, otherwise plain summary */}
        {isTrigger && tKws.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {tKws.map((kw, i) => (
              <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 border border-amber-300 shadow-sm">{kw}</span>
            ))}
          </div>
        ) : (
          <p className="text-[11.5px] text-muted-foreground mt-2 line-clamp-2 break-words">{summary(data.kind, data.config, data.triggerType)}</p>
        )}
        {options.length > 0 && (
          // Each button owns a source handle at its own bottom-center, so a branch
          // line leaves exactly from that button (like the Criteria Router's ports).
          <div className="mt-2.5 flex gap-1.5 pb-3">
            {options.map((opt, i) => (
              <div key={opt.id} className="relative flex-1 flex items-center justify-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-1.5 text-[10px] font-medium text-foreground">
                <span className="grid place-items-center w-4 h-4 rounded bg-primary/15 text-primary text-[8px] font-bold shrink-0">{i + 1}</span>
                <span className="truncate">{opt.title}</span>
                <Handle id={opt.id} type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-card !-bottom-[13px]" />
              </div>
            ))}
          </div>
        )}
      </div>
      {data.kind === "condition" ? (
        <>
          <div className="flex justify-between px-6 pb-1.5 -mt-1">
            <span className="text-[8px] font-bold text-emerald-600">MATCH</span>
            <span className="text-[8px] font-bold text-slate-400">ELSE</span>
          </div>
          <Handle id="match" type="source" position={Position.Bottom} style={{ left: "26%" }} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-card" />
          <Handle id="else" type="source" position={Position.Bottom} style={{ left: "74%" }} className="!w-2.5 !h-2.5 !bg-slate-400 !border-2 !border-card" />
        </>
      ) : options.length > 0 ? null : (
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-card" />
      )}
    </div>
  );
}
const nodeTypes: NodeTypes = { flowNode: FlowNode };

// ── Model <-> React Flow conversion ─────────────────────────────────────────
function toRF(auto: AutomationDetail): { nodes: AppNode[]; edges: Edge[] } {
  const flow = auto.flow ?? { nodes: [], edges: [] };
  const srcNodes = flow.nodes ?? [];
  if (srcNodes.length === 0) {
    // Seed from legacy actions[] (or just a trigger).
    const nodes: AppNode[] = [{
      id: "trigger", type: "flowNode", position: { x: 80, y: 40 },
      data: { kind: "trigger", config: (auto.trigger_config ?? {}) as Record<string, unknown>, triggerType: auto.trigger_type },
    }];
    const edges: Edge[] = [];
    let prev = "trigger";
    (auto.actions ?? []).forEach((a, i) => {
      const id = `n${i}`;
      nodes.push({ id, type: "flowNode", position: { x: 80, y: 190 + i * 150 }, data: { kind: a.type, config: (a.params ?? {}) as Record<string, unknown> } });
      edges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
      prev = id;
    });
    return { nodes, edges };
  }
  const nodes: AppNode[] = srcNodes.map((n) => ({
    id: n.id, type: "flowNode", position: { x: n.x ?? 80, y: n.y ?? 80 },
    data: {
      kind: n.type, config: (n.config ?? {}) as Record<string, unknown>,
      triggerType: n.type === "trigger" ? auto.trigger_type : undefined,
    },
  }));
  const edges: Edge[] = (flow.edges ?? []).map((e, i) => ({
    id: `e${i}-${e.from}-${e.to}-${e.handle ?? ""}`, source: e.from, target: e.to,
    sourceHandle: e.handle || undefined,
    label: e.handle === "match" ? "Match" : e.handle === "else" ? "Else" : undefined,
  }));
  return { nodes, edges };
}

function toModel(nodes: AppNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.kind, x: Math.round(n.position.x), y: Math.round(n.position.y), config: n.data.config })),
    edges: edges.map((e) => ({ from: e.source, to: e.target, handle: e.sourceHandle || undefined })),
  };
}

// Clean top-down layered ("tree") layout: depth = distance from a root (a node
// with no incoming edge), siblings spread horizontally and centered per level.
// Keeps the downward flow the builder is designed around.
function autoLayout(nodes: AppNode[], edges: Edge[]): AppNode[] {
  if (nodes.length === 0) return nodes;
  const NODE_W = 260, X_GAP = 56, ROW_H = 210;
  const ids = new Set(nodes.map((n) => n.id));
  const children: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  nodes.forEach((n) => { children[n.id] = []; indeg[n.id] = 0; });
  edges.forEach((e) => { if (ids.has(e.source) && ids.has(e.target)) { children[e.source].push(e.target); indeg[e.target]++; } });
  // Roots: no incoming edge (trigger first for a stable order).
  const roots = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id)
    .sort((a) => (a === "trigger" ? -1 : 0));
  const levels: string[][] = [];
  const seen = new Set<string>();
  let frontier = roots.length ? roots : [nodes[0].id];
  while (frontier.length) {
    const row = frontier.filter((idn) => !seen.has(idn));
    if (row.length === 0) break;
    row.forEach((idn) => seen.add(idn));
    levels.push(row);
    frontier = row.flatMap((idn) => children[idn].filter((c) => !seen.has(c)));
  }
  // Disconnected leftovers get their own trailing row.
  const leftover = nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
  if (leftover.length) levels.push(leftover);
  const pos: Record<string, { x: number; y: number }> = {};
  levels.forEach((row, d) => {
    const totalW = row.length * NODE_W + (row.length - 1) * X_GAP;
    let x = -totalW / 2 + NODE_W / 2;
    row.forEach((idn) => { pos[idn] = { x, y: d * ROW_H }; x += NODE_W + X_GAP; });
  });
  const minX = Math.min(...Object.values(pos).map((p) => p.x));
  return nodes.map((n) => ({ ...n, position: pos[n.id] ? { x: pos[n.id].x - minX + 80, y: pos[n.id].y + 40 } : n.position }));
}

// ── Page ────────────────────────────────────────────────────────────────────
function Builder() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { fitView } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [auto, setAuto] = useState<AutomationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Escape closes overlays newest-first (shared LIFO stack): the node inspector
  // and the add-node palette both register, so Esc resolves the topmost one.
  useEscClose(paletteOpen, () => setPaletteOpen(false));
  useEscClose(!!selId, () => setSelId(null));

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [sheetEmail, setSheetEmail] = useState("");

  // ── Undo / redo (Ctrl+Z / Ctrl+Y) ──
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const history = useRef<{ past: { n: AppNode[]; e: Edge[] }[]; future: { n: AppNode[]; e: Edge[] }[] }>({ past: [], future: [] });
  const lastPush = useRef(0);
  const pushHistory = useCallback(() => {
    const now = Date.now();
    if (now - lastPush.current < 80) return; // coalesce batched changes (e.g. node + its edges)
    lastPush.current = now;
    history.current.past.push({ n: nodesRef.current, e: edgesRef.current });
    if (history.current.past.length > 60) history.current.past.shift();
    history.current.future = [];
  }, []);
  const undo = useCallback(() => {
    const h = history.current;
    if (!h.past.length) return;
    h.future.push({ n: nodesRef.current, e: edgesRef.current });
    const prev = h.past.pop()!;
    setNodes(prev.n); setEdges(prev.e); setDirty(true);
  }, [setNodes, setEdges]);
  const redo = useCallback(() => {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push({ n: nodesRef.current, e: edgesRef.current });
    const nxt = h.future.pop()!;
    setNodes(nxt.n); setEdges(nxt.e); setDirty(true);
  }, [setNodes, setEdges]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
      if (k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && ev.shiftKey)) { ev.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  useEffect(() => {
    api.getAutomation(id).then((a) => {
      const { nodes: n, edges: e } = toRF(a);
      setAuto(a); setActive(a.is_active); setNodes(n); setEdges(e); setLoading(false);
    }).catch(() => setLoading(false));
    api.listCampaigns().then((cs) => setCampaigns(cs.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
    api.listFlows().then((fs) => setForms(fs.filter((f) => f.status === "published").map((f) => ({ id: f.id, name: f.name })))).catch(() => {});
    api.getGoogleSheetsInfo().then((i) => setSheetEmail(i.client_email)).catch(() => {});
    api.listAgents().then((as) => setAgents(as.map((a) => ({ id: a.id, name: a.full_name })))).catch(() => {});
    api.listStages().then((ss) => setStages(ss.map((s) => ({ id: s.id, name: s.name })))).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback((c: Connection) => { pushHistory(); setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#94A3B8", strokeWidth: 1.6 }, label: c.sourceHandle === "match" ? "Match" : c.sourceHandle === "else" ? "Else" : undefined }, eds)); setDirty(true); }, [setEdges, pushHistory]);
  const markDirty = useCallback(() => setDirty(true), []);

  function tidy() {
    pushHistory();
    setNodes((nds) => autoLayout(nds, edges));
    setDirty(true);
    setTimeout(() => fitView({ padding: 0.3, duration: 300, maxZoom: 1 }), 60);
  }

  function addNode(kind: string) {
    setPaletteOpen(false);
    pushHistory();
    // Drop the new node below whatever is lowest (or below the selected node),
    // so nodes never pile up on top of each other at the viewport center.
    const anchor = selId ? nodes.find((n) => n.id === selId) : null;
    const maxY = nodes.length ? Math.max(...nodes.map((n) => n.position.y)) : 40;
    const pos = { x: anchor ? anchor.position.x : 120, y: (anchor ? Math.max(anchor.position.y, maxY) : maxY) + 190 };
    const nid = `n${Date.now()}`;
    const data: NodeData = kind === "trigger"
      ? { kind, config: {}, triggerType: auto?.trigger_type ?? "new_message" }
      : { kind, config: {} };
    setNodes((nds) => [...nds, { id: nid, type: "flowNode", position: pos, data }]);
    setSelId(nid); setDirty(true);
  }

  function updateConfig(nodeId: string, config: Record<string, unknown>) {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n)));
    setDirty(true);
  }
  function deleteNode(nodeId: string) {
    if (nodeId === "trigger") { setToast(t("automation.theTriggerCanTBe")); return; }
    pushHistory();
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelId(null); setDirty(true);
  }

  async function save() {
    if (!auto) return;
    setSaving(true);
    const model = toModel(nodes, edges);
    // trigger_type is the EVENT (set at create). Each trigger node's conditions
    // now live in the flow graph, so the automation-level trigger_config is cleared.
    try {
      await api.updateAutomation(auto.id, { flow: model, trigger_config: {} });
      setDirty(false); setToast(t("automation.flowSaved"));
    } catch (e) { setToast(String(e)); }
    finally { setSaving(false); }
  }
  async function toggleActive() {
    if (!auto) return;
    const next = !active; setActive(next);
    try { await api.updateAutomation(auto.id, { is_active: next }); }
    catch { setActive(!next); setToast(t("automation.couldNotUpdateStatus")); }
  }

  const selected = useMemo(() => nodes.find((n) => n.id === selId) ?? null, [nodes, selId]);

  if (loading) return <div className="grid place-items-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!auto) return <div className="p-8 text-muted-foreground">{t("automation.automationNotFound")}</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0 z-10">
        <button onClick={() => router.push("/settings/automation")} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <p className="font-bold text-[15px] text-foreground truncate">{auto.name}</p>
          <p className="text-[11.5px] text-muted-foreground">{t("automation.visualFlow")} {nodes.length} node{nodes.length === 1 ? "" : "s"} {t("automation.trigger")} {t(eventLabel(auto.trigger_type))}</p>
        </div>
        <div className="flex-1" />
        <Tip label={t("automation.undoCtrlZ")}><button onClick={undo} className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><Undo2 className="w-[18px] h-[18px]" /></button></Tip>
        <Tip label={t("automation.redoCtrlY")}><button onClick={redo} className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><Redo2 className="w-[18px] h-[18px]" /></button></Tip>
        <Tip label={t("automation.autoArrangeNodes")}><button onClick={tidy} className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><LayoutGrid className="w-[18px] h-[18px]" /></button></Tip>
        <button onClick={() => setPaletteOpen((v) => !v)} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none"><Plus className="w-4 h-4" /> {t("automation.addNode")}</button>
        <label className="inline-flex items-center gap-2 cursor-pointer mx-1">
          <span className="relative inline-flex">
            <input type="checkbox" checked={active} onChange={toggleActive} className="sr-only peer" />
            <span className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:shadow after:transition-all peer-checked:after:translate-x-4" />
          </span>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{active ? t("dashboard.active") : t("automation.paused")}</span>
        </label>
        <button onClick={save} disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md disabled:opacity-50 transition-all outline-none">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{dirty ? t("common.save") : t("automation.saved")}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative" ref={wrapRef}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={(c) => { if (c.some((x) => x.type === "remove")) pushHistory(); onNodesChange(c); if (c.some((x) => x.type === "position" || x.type === "remove")) markDirty(); }}
          onEdgesChange={(c) => { if (c.some((x) => x.type === "remove")) pushHistory(); onEdgesChange(c); if (c.some((x) => x.type === "remove")) markDirty(); }}
          onConnect={onConnect}
          onNodeDragStart={() => pushHistory()}
          onNodeClick={(_, n) => setSelId(n.id)}
          onPaneClick={() => { setSelId(null); setPaletteOpen(false); }}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: true, style: { stroke: "#94A3B8", strokeWidth: 1.6 } }}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode={["Shift"]}
          selectionKeyCode={["Shift"]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#CBD5E1" />
          <Controls showInteractive={false} className="!shadow-md !border !border-border !rounded-lg overflow-hidden" />
          <MiniMap pannable zoomable className="!rounded-lg !border !border-border" nodeColor={(n) => meta((n.data as NodeData).kind).accent} />
        </ReactFlow>

        {/* Palette */}
        {paletteOpen && (
          <div className="absolute top-3 right-3 z-20 w-[280px] max-h-[calc(100%-24px)] overflow-y-auto bg-card rounded-lg shadow-xl border border-border py-1.5 animate-scale-in">
            {PALETTE.map((grp) => (
              <div key={grp.group}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{grp.group}</p>
                {grp.kinds.map((k) => {
                  const m = meta(k);
                  return (
                    <button key={k} onClick={() => addNode(k)} className="flex items-center gap-2.5 w-full px-3 py-1.5 hover:bg-muted text-left outline-none transition-colors">
                      <div className="w-7 h-7 rounded-md grid place-items-center shrink-0" style={{ backgroundColor: m.accent + "1a", color: m.accent }}><m.Icon className="w-[15px] h-[15px]" /></div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">{t(m.label)}{!EXECUTED.has(k) && k !== "trigger" && <span className="text-[8px] font-bold uppercase text-amber-600">soon</span>}</p>
                        <p className="text-[10.5px] text-muted-foreground truncate">{t(m.desc)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Inspector */}
        {selected && (
          <div className="absolute inset-y-0 right-0 z-20 w-[340px] bg-card border-l border-border shadow-xl flex flex-col animate-scale-in">
            <Inspector node={selected} triggerType={auto.trigger_type} campaigns={campaigns} forms={forms} agents={agents} stages={stages} sheetEmail={sheetEmail} onChange={(cfg) => updateConfig(selected.id, cfg)} onClose={() => setSelId(null)} onDelete={() => deleteNode(selected.id)} />
          </div>
        )}
      </div>

      {toast && <ToastView msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Auto-reply node config: Text, Image, reply Buttons, or a List menu ──────
type ReplyBtn = { title?: string; id?: string };
type ReplyRow = { title?: string; description?: string; id?: string };

// Auto-generate a WhatsApp button callback id (payload). 16-char url-safe token
// (matches the SmartKonek style). The user can edit or regenerate it — the
// button_click trigger matches on this id.
function genCallbackId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Inline image uploader (reuses POST /api/uploads). Shows a thumbnail + clear.
function ImageUpload({ url, onChange }: { url: string; onChange: (u: string) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true); setErr("");
    try { const r = await api.uploadFile(file); onChange(r.url); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      {url ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full max-h-40 object-cover rounded-md border border-border" />
          <button type="button" onClick={() => onChange("")} className="absolute top-1.5 right-1.5 w-6 h-6 grid place-items-center rounded-full bg-black/60 text-white text-sm leading-none">×</button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="flex flex-col items-center justify-center gap-1.5 w-full h-24 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors outline-none">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
          <span className="text-[12px] font-medium">{busy ? t("automation.uploading") : t("automation.uploadImage")}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {err && <p className="text-[12px] text-destructive">{err}</p>}
    </div>
  );
}

function AutoReplyConfig({ c, set, forms }: { c: Record<string, unknown>; set: (k: string, v: unknown) => void; forms: { id: string; name: string }[] }) {
  const { t } = useI18n();
  // Composed reply: a body + an optional image + an optional interactive
  // (buttons/list). Legacy nodes used a single message_type; migrate on read.
  const legacy = String(c.message_type ?? "");
  const interactive = String(c.interactive ?? (legacy === "buttons" || legacy === "list" ? legacy : "none"));
  const buttons: ReplyBtn[] = Array.isArray(c.buttons) ? (c.buttons as ReplyBtn[]) : [];
  const section0 = (Array.isArray(c.sections) ? (c.sections as Record<string, unknown>[])[0] : undefined) ?? {};
  const rows: ReplyRow[] = Array.isArray(section0.rows) ? (section0.rows as ReplyRow[]) : [];
  const setRows = (next: ReplyRow[]) => set("sections", [{ title: String(section0.title ?? ""), rows: next }]);
  const bodyVal = String(c.body ?? c.message ?? "");

  return (
    <>
      {/* Body — works standalone or combined with an image / buttons / list. */}
      <Field label={t("automation.message")}><textarea value={bodyVal} onChange={(e) => set("body", e.target.value)} rows={4} placeholder={t("automation.typeTheAutoReply")} className={cn(INP, "resize-none h-auto py-2")} /></Field>

      {/* Optional image — becomes the header image when combined with buttons. */}
      <Field label={t("automation.imageOptional")}><ImageUpload url={String(c.media_url ?? "")} onChange={(u) => set("media_url", u)} /></Field>

      {/* Optional interactive: reply buttons or a list menu. */}
      <Field label={t("automation.interactiveOptional")}>
        <Select value={interactive} searchable={false} onChange={(v) => set("interactive", v)} className="w-full"
          options={[{ value: "none", label: "None (text / image only)" }, { value: "buttons", label: "Reply buttons" }, { value: "list", label: "List menu" }, { value: "flow", label: "WhatsApp Flow button" }, { value: "location_request", label: "Request location" }]} />
      </Field>

      {interactive === "flow" && <>
        <Field label={t("automation.whatsappFlow")}><Select value={String(c.flow_id ?? "")} onChange={(v) => set("flow_id", v)} options={forms.map((f) => ({ value: f.id, label: f.name }))} placeholder={t("automation.selectAPublishedFlow")} className="w-full" /></Field>
        <Field label={t("automation.buttonLabel")}><input value={String(c.flow_cta ?? "")} onChange={(e) => set("flow_cta", e.target.value)} placeholder={t("automation.getOffers")} className={INP} /></Field>
        {forms.length === 0 && <p className="text-[12px] text-amber-600">{t("automation.noPublishedFormsYetPublish")}</p>}
      </>}

      {(interactive === "buttons" || interactive === "list") && (
        <Field label={t("automation.footerOptional")}><input value={String(c.footer ?? "")} onChange={(e) => set("footer", e.target.value)} placeholder={t("automation.smallFootnote")} className={INP} /></Field>
      )}

      {interactive === "buttons" && (
        <Field label={t("automation.buttonsUpTo3")}>
          <div className="space-y-2">
            {buttons.map((b, i) => (
              <div key={i} className="rounded-md border border-border/60 p-2 space-y-1.5">
                <div className="flex gap-1.5 items-center">
                  <input value={String(b?.title ?? "")} maxLength={20} onChange={(e) => { const arr = [...buttons]; arr[i] = { ...arr[i], title: e.target.value }; set("buttons", arr); }} placeholder={`Button ${i + 1} label`} className={cn(INP, "flex-1")} />
                  <button type="button" onClick={() => { const arr = [...buttons]; arr.splice(i, 1); set("buttons", arr); }} className="px-1.5 text-muted-foreground hover:text-destructive text-lg leading-none">×</button>
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground shrink-0">{t("automation.callbackId")}</span>
                  <input value={String(b?.id ?? "")} onChange={(e) => { const arr = [...buttons]; arr[i] = { ...arr[i], id: e.target.value }; set("buttons", arr); }} placeholder="auto-generated" className={cn(INP, "flex-1 !h-8 text-[12px]")} />
                  <Tip label={t("automation.regenerateId")}><button type="button" onClick={() => { const arr = [...buttons]; arr[i] = { ...arr[i], id: genCallbackId() }; set("buttons", arr); }} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none shrink-0"><RefreshCw className="w-3.5 h-3.5" /></button></Tip>
                </div>
              </div>
            ))}
            {buttons.length < 3 && <button type="button" onClick={() => set("buttons", [...buttons, { title: "", id: genCallbackId() }])} className="text-[12.5px] font-semibold text-primary hover:underline">{t("automation.addButton")}</button>}
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-1.5">{t("automation.callbackIdsAreAutoGenerated")} <b>{t("automation.buttonClick")}</b> {t("automation.triggerCanMatchOnThem")}</p>
        </Field>
      )}

      {interactive === "list" && <>
        <Field label={t("automation.listButtonLabel")}><input value={String(c.button_text ?? "")} onChange={(e) => set("button_text", e.target.value)} placeholder={t("automation.menu")} className={INP} /></Field>
        <Field label={t("automation.sectionTitleOptional")}><input value={String(section0.title ?? "")} onChange={(e) => set("sections", [{ title: e.target.value, rows }])} placeholder={t("automation.chooseAnOption")} className={INP} /></Field>
        {c.media_url ? <p className="text-[11.5px] text-amber-600">{t("automation.whatsappListsCanTShow")}</p> : null}
        <Field label={t("automation.listItems")}>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input value={String(r?.title ?? "")} onChange={(e) => { const arr = [...rows]; arr[i] = { ...arr[i], title: e.target.value }; setRows(arr); }} placeholder={`Item ${i + 1} title`} className={cn(INP, "flex-1")} />
                <input value={String(r?.description ?? "")} onChange={(e) => { const arr = [...rows]; arr[i] = { ...arr[i], description: e.target.value }; setRows(arr); }} placeholder={t("automation.descriptionOptional")} className={cn(INP, "flex-1")} />
                <button type="button" onClick={() => { const arr = [...rows]; arr.splice(i, 1); setRows(arr); }} className="px-1.5 text-muted-foreground hover:text-destructive text-lg leading-none">×</button>
              </div>
            ))}
            {rows.length < 10 && <button type="button" onClick={() => setRows([...rows, { title: "", description: "" }])} className="text-[12.5px] font-semibold text-primary hover:underline">{t("automation.addItem")}</button>}
          </div>
        </Field>
      </>}
    </>
  );
}

// ── Trigger conditions (multi-condition; the automation fires only when ALL match) ──
const TRIGGER_CONDITIONS: { value: string; label: string; soon?: boolean }[] = [
  { value: "keyword_include", label: "Message text includes any of keywords" },
  { value: "keyword_exact", label: "Message text exactly matches any of keywords" },
  { value: "keyword_exclude", label: "Message text excludes any of keywords" },
  { value: "regex_match", label: "Message text matches regex" },
  { value: "callback_id", label: "List / Button callback ID matches" },
  { value: "message_type", label: "Message type" },
  { value: "file_type", label: "File type matches" },
  { value: "catalog_order", label: "New catalog order received" },
  { value: "first_or_after_24h", label: "Very first message (or after 24h)" },
  { value: "individual_chat", label: "Received in an individual chat" },
  { value: "all_messages", label: "All messages / no condition" },
  { value: "custom_condition", label: "Custom condition (contact attribute)" },
  { value: "office_hours", label: "Received inside business hours", soon: true },
  { value: "after_hours", label: "Received outside business hours", soon: true },
  { value: "template_message", label: "Template message", soon: true },
];
const MSG_TYPES = ["text", "image", "video", "audio", "document", "location", "contacts", "sticker", "order"];

// legacyToCondition maps a pre-multi-condition trigger (trigger_type + flat config)
// into one condition object so old automations edit/display cleanly.
function legacyToCondition(triggerType: string | undefined, c: Record<string, unknown>): Record<string, unknown> {
  switch (triggerType) {
    case "keyword_match": return { type: "keyword_include", keywords: c.keywords ?? [], match_mode: c.match_mode ?? "any", case_sensitive: c.case_sensitive ?? false };
    case "button_click": return { type: "callback_id", callback: c.callback ?? "" };
    case "new_conversation": return { type: "first_or_after_24h" };
    case "office_hours": return { type: "office_hours" };
    case "after_hours": return { type: "after_hours" };
    default: return { type: "all_messages" };
  }
}

function TriggerConditionsConfig({ triggerType, c, onChange }: { triggerType: string; c: Record<string, unknown>; onChange: (cfg: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const conditions: Record<string, unknown>[] = Array.isArray(c.conditions) && (c.conditions as unknown[]).length
    ? (c.conditions as Record<string, unknown>[])
    : [legacyToCondition(triggerType, c)];
  const write = (next: Record<string, unknown>[]) => onChange({ conditions: next });
  const patch = (i: number, p: Record<string, unknown>) => write(conditions.map((cd, j) => (j === i ? { ...cd, ...p } : cd)));
  const setType = (i: number, type: string) => write(conditions.map((cd, j) => (j === i ? { type } : cd)));
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">{t("automation.firesOnlyWhen")} <b className="text-foreground/80">all</b> {t("automation.conditionsBelowMatch")}</p>
      {conditions.map((cd, i) => {
        const type = String(cd.type ?? "keyword_include");
        return (
          <div key={i} className="rounded-lg border border-border p-3 space-y-2.5 bg-muted/20">
            <div className="flex items-center gap-2">
              <Select value={type} onChange={(v) => setType(i, v)} className="flex-1"
                options={TRIGGER_CONDITIONS.map((tc) => ({ value: tc.value, label: t(tc.label) + (tc.soon ? " (soon)" : "") }))} />
              {conditions.length > 1 && <button type="button" onClick={() => write(conditions.filter((_, j) => j !== i))} className="p-1 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive outline-none"><X className="w-4 h-4" /></button>}
            </div>
            <CondFields type={type} cd={cd} patch={(p) => patch(i, p)} />
          </div>
        );
      })}
      <button type="button" onClick={() => write([...conditions, { type: "keyword_include" }])}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-border text-[13px] font-semibold text-foreground/80 hover:border-primary/40 hover:bg-muted/40 outline-none">
        <Plus className="w-4 h-4" /> {t("automation.addTriggerCondition")}
      </button>
    </div>
  );
}

function CondFields({ type, cd, patch }: { type: string; cd: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const kws: string[] = Array.isArray(cd.keywords) ? (cd.keywords as string[]) : [];
  const [draft, setDraft] = useState("");
  const addKw = (raw: string) => { const parts = raw.split(",").map((k) => k.trim()).filter(Boolean); if (parts.length) { patch({ keywords: Array.from(new Set([...kws, ...parts])) }); setDraft(""); } };
  if (type === "keyword_include" || type === "keyword_exact" || type === "keyword_exclude") {
    return (
      <>
        <div className="rounded-md border border-input bg-background px-2 py-1.5 flex flex-wrap gap-1.5">
          {kws.map((k, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/25 px-2 py-0.5 text-[12.5px] font-semibold text-primary">{k}
              <button type="button" onClick={() => patch({ keywords: kws.filter((_, j) => j !== i) })} className="text-primary/60 hover:text-destructive leading-none text-[15px]">×</button></span>
          ))}
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKw(draft); } else if (e.key === "Backspace" && !draft && kws.length) patch({ keywords: kws.slice(0, -1) }); }}
            onBlur={() => { if (draft) addKw(draft); }} placeholder={kws.length ? "" : t("automation.typeAKeywordEnterTo")} className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5" />
        </div>
        {type === "keyword_include" && (
          <Field label={t("automation.matchMode")}><Select value={String(cd.match_mode ?? "any")} onChange={(v) => patch({ match_mode: v })} searchable={false}
            options={[["any", "Contains any keyword"], ["all", "Contains all keywords"], ["starts_with", "Starts with a keyword"]].map(([v, l]) => ({ value: v, label: l }))} className="w-full" /></Field>
        )}
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={Boolean(cd.case_sensitive)} onChange={(e) => patch({ case_sensitive: e.target.checked })} className="w-4 h-4 rounded border-input text-primary focus:ring-primary/25" /><span className="text-[13px] font-medium text-foreground/80">{t("automation.caseSensitive")}</span></label>
      </>
    );
  }
  if (type === "regex_match") return <Field label={t("automation.regexPattern")}><input value={String(cd.pattern ?? "")} onChange={(e) => patch({ pattern: e.target.value })} placeholder="^(hi|halo)\b" className={INP} /></Field>;
  if (type === "callback_id") return <Field label={t("automation.callbackIdContainsOptional")}><input value={String(cd.callback ?? "")} onChange={(e) => patch({ callback: e.target.value })} placeholder={t("automation.eGDaftarBlankAny")} className={INP} /></Field>;
  if (type === "message_type") {
    const sel: string[] = Array.isArray(cd.message_types) ? (cd.message_types as string[]) : [];
    return <Field label={t("automation.messageTypeIsOneOf")}><div className="flex flex-wrap gap-1.5">{MSG_TYPES.map((t) => { const on = sel.includes(t); return <button key={t} type="button" onClick={() => patch({ message_types: on ? sel.filter((x) => x !== t) : [...sel, t] })} className={cn("px-2 py-1 rounded-md text-[12px] font-medium border capitalize outline-none", on ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{t}</button>; })}</div></Field>;
  }
  if (type === "file_type") return <Field label={t("automation.fileExtensionsCommaSeparated")}><input value={Array.isArray(cd.extensions) ? (cd.extensions as string[]).join(", ") : ""} onChange={(e) => patch({ extensions: e.target.value.split(",").map((x) => x.trim().replace(/^\./, "")).filter(Boolean) })} placeholder={t("automation.pdfXlsxJpg")} className={INP} /></Field>;
  if (type === "custom_condition") {
    const op = String(cd.operator ?? "equals");
    return (
      <div className="space-y-2">
        <Field label={t("automation.contactAttribute")}><input value={String(cd.attribute ?? "")} onChange={(e) => patch({ attribute: e.target.value })} placeholder={t("automation.attributeKeyEGCity")} className={INP} /></Field>
        <Field label={t("automation.operator")}><Select value={op} onChange={(v) => patch({ operator: v })} searchable={false} options={[["equals", "equals"], ["not_equals", "not equals"], ["contains", "contains"], ["is_set", "is set"], ["is_not_set", "is not set"]].map(([v, l]) => ({ value: v, label: l }))} className="w-full" /></Field>
        {op !== "is_set" && op !== "is_not_set" && <Field label={t("automation.value")}><input value={String(cd.value ?? "")} onChange={(e) => patch({ value: e.target.value })} placeholder="value" className={INP} /></Field>}
      </div>
    );
  }
  if (type === "office_hours" || type === "after_hours" || type === "template_message")
    return <p className="text-[12px] text-amber-600">{t("automation.configurableButTheEngineDoesn")}</p>;
  // catalog_order, first_or_after_24h, individual_chat, all_messages -> no config
  return <p className="text-[12.5px] text-muted-foreground">{t("automation.noExtraConfigurationNeeded")}</p>;
}

// ── Inspector (per-node config) ─────────────────────────────────────────────
function Inspector({ node, triggerType, campaigns, forms, agents, stages, sheetEmail, onChange, onClose, onDelete }: {
  node: AppNode; triggerType: string; campaigns: { id: string; name: string }[]; forms: { id: string; name: string }[]; agents: { id: string; name: string }[]; stages: { id: string; name: string }[]; sheetEmail: string; onChange: (cfg: Record<string, unknown>) => void; onClose: () => void; onDelete: () => void;
}) {
  const { t } = useI18n();
  const pickById = (list: { id: string; name: string }[], idKey: string, nameKey: string) => (v: string) => onChange({ ...node.data.config, [idKey]: v, [nameKey]: list.find((x) => x.id === v)?.name || "" });
  const kind = node.data.kind;
  const c = node.data.config || {};
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v });
  const m = meta(kind);
  const isTrigger = kind === "trigger";

  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <div className="w-8 h-8 rounded-md grid place-items-center shrink-0" style={{ backgroundColor: m.accent + "1a", color: m.accent }}><m.Icon className="w-[17px] h-[17px]" /></div>
        <p className="font-bold text-[14px] text-foreground flex-1 truncate">{t(isTrigger ? eventLabel(triggerType) : m.label)}</p>
        <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted outline-none"><X className="w-[18px] h-[18px]" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!isTrigger && !EXECUTED.has(kind) && (
          <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-700 font-medium">{t("automation.configurableNowTheEngineDoesn")}</div>
        )}
        {isTrigger && <TriggerConditionsConfig triggerType={triggerType} c={c} onChange={onChange} />}
        {kind === "send_message" && <AutoReplyConfig c={c} set={set} forms={forms} />}
        {kind === "send_template" && <Field label={t("automation.templateName")}><input value={String(c.template_name ?? "")} onChange={(e) => set("template_name", e.target.value)} placeholder="welcome_v1" className={INP} /></Field>}
        {kind === "send_form" && <>
          <Field label={t("automation.form")}><Select value={String(c.form_id ?? "")} onChange={pickById(forms, "form_id", "form_name")} options={forms.map((f) => ({ value: f.id, label: f.name }))} placeholder={t("automation.searchPublishedForm")} className="w-full" /></Field>
          <Field label={t("automation.messageText")}><input value={String(c.body ?? "")} onChange={(e) => set("body", e.target.value)} placeholder={t("automation.pleaseFillInThisForm")} className={INP} /></Field>
          <Field label={t("automation.buttonLabel")}><input value={String(c.cta ?? "")} onChange={(e) => set("cta", e.target.value)} placeholder={t("automation.openForm")} className={INP} /></Field>
          {forms.length === 0 && <p className="text-[12px] text-amber-600">{t("automation.noPublishedFormsYetPublish")}</p>}
        </>}
        {kind === "assign_agent" && <Field label={t("contacts.agent")}><Select value={String(c.agent_id ?? "")} onChange={pickById(agents, "agent_id", "agent_name")} options={agents.map((a) => ({ value: a.id, label: a.name }))} placeholder={t("automation.searchAgent")} className="w-full" /></Field>}
        {kind === "assign_campaign" && <Field label={t("automation.campaign")}><Select value={String(c.campaign_id ?? "")} onChange={pickById(campaigns, "campaign_id", "campaign_name")} options={campaigns.map((cp) => ({ value: cp.id, label: cp.name }))} placeholder={t("automation.searchCampaign")} className="w-full" /></Field>}
        {(kind === "add_tag" || kind === "remove_tag") && <Field label={t("automation.tagsCommaSeparated")}><input value={Array.isArray(c.tags) ? (c.tags as string[]).join(", ") : ""} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} placeholder={t("automation.vipPricing")} className={INP} /></Field>}
        {kind === "set_contact_attribute" && <AttrMappings c={c} onChange={onChange} />}
        {kind === "set_conversation_status" && <Field label={t("automation.status")}><Select value={String(c.status ?? "open")} onChange={(v) => set("status", v)} searchable={false} options={["open", "snoozed", "closed"].map((p) => ({ value: p, label: p }))} className="w-full" /></Field>}
        {kind === "set_stage" && <Field label={t("automation.pipelineStage")}>
          <Select value={String(c.stage_id ?? "")} onChange={pickById(stages, "stage_id", "stage_name")} options={stages.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("automation.searchStage")} className="w-full" />
          {stages.length === 0 && <p className="text-[12px] text-amber-600 mt-1.5">{t("automation.noPipelineStagesDefinedYet")}</p>}
        </Field>}
        {kind === "set_interest" && <Field label={t("dashboard.interestLevel")}><Select value={String(c.interest_level ?? "")} onChange={(v) => set("interest_level", v)} searchable={false} options={[["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"]].map(([v, l]) => ({ value: v, label: l }))} placeholder={t("automation.choose")} className="w-full" /></Field>}
        {kind === "google_sheet" && <>
          <Field label={t("automation.googleSheetUrl")}><input value={String(c.sheet_url ?? "")} onChange={(e) => set("sheet_url", e.target.value)} placeholder={t("automation.pasteTheSheetUrl")} className={INP} /></Field>
          <Field label={t("automation.tabName")}><input value={String(c.sheet_tab ?? "")} onChange={(e) => set("sheet_tab", e.target.value)} placeholder={t("automation.sheet1")} className={INP} /></Field>
          <Field label={t("automation.attributesToAppendCommaSeparated")}><input value={Array.isArray(c.attributes) ? (c.attributes as string[]).join(", ") : ""} onChange={(e) => set("attributes", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} placeholder={t("automation.preferredModelCity")} className={INP} /></Field>
          <p className="text-[12px] text-muted-foreground">{t("automation.rowAppendedTimestampNamePhone")}</p>
          <ShareWithSA email={sheetEmail} />
        </>}
        {kind === "set_priority" && <Field label={t("automation.priority")}><Select value={String(c.priority ?? "normal")} onChange={(v) => set("priority", v)} searchable={false} options={["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p }))} className="w-full" /></Field>}
        {kind === "unassign_team" && <p className="text-[13px] text-muted-foreground">{t("automation.clearsTheConversationSAssigned")}</p>}
        {kind === "remove_campaign" && <p className="text-[13px] text-muted-foreground">{t("automation.clearsTheConversationSCampaign")}</p>}
        {kind === "blacklist" && <p className="text-[13px] text-muted-foreground">{t("automation.blocksThisContactFromFuture")}</p>}
        {kind === "send_email" && <>
          <Field label={t("automation.toEmail")}><input value={String(c.to ?? "")} onChange={(e) => set("to", e.target.value)} placeholder="sales@yourco.com" className={INP} /></Field>
          <Field label={t("automation.subject")}><input value={String(c.subject ?? "")} onChange={(e) => set("subject", e.target.value)} placeholder={t("automation.newLeadFullName")} className={INP} /></Field>
          <Field label={t("automation.body")}><textarea value={String(c.body ?? "")} onChange={(e) => set("body", e.target.value)} rows={4} placeholder={t("automation.fullNamePhoneJustCame")} className={cn(INP, "resize-none h-auto py-2")} /></Field>
          <p className="text-[12px] text-muted-foreground">{t("automation.sentViaYourConfiguredSmtp")} {"{first_name}"}, {"{full_name}"}, {"{phone}"} {t("automation.andContactAttributes")}</p>
        </>}
        {kind === "webhook_notify" && <Field label={t("automation.webhookUrl")}><input value={String(c.url ?? "")} onChange={(e) => set("url", e.target.value)} placeholder="https://..." className={INP} /></Field>}
        {kind === "rest_api" && <>
          <Field label={t("automation.method")}><Select value={String(c.method ?? "POST")} onChange={(v) => set("method", v)} searchable={false} options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))} className="w-full" /></Field>
          <Field label="URL"><input value={String(c.url ?? "")} onChange={(e) => set("url", e.target.value)} placeholder="https://api.example.com/hook" className={INP} /></Field>
          <Field label={t("automation.headers")}>
            <div className="space-y-1.5">
              {(Array.isArray(c.headers) ? c.headers as Record<string, unknown>[] : []).map((h, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input value={String(h?.key ?? "")} onChange={(e) => { const arr = [...(c.headers as Record<string, unknown>[] ?? [])]; arr[i] = { ...arr[i], key: e.target.value }; set("headers", arr); }} placeholder={t("automation.header")} className={cn(INP, "flex-1")} />
                  <input value={String(h?.value ?? "")} onChange={(e) => { const arr = [...(c.headers as Record<string, unknown>[] ?? [])]; arr[i] = { ...arr[i], value: e.target.value }; set("headers", arr); }} placeholder={t("automation.value")} className={cn(INP, "flex-1")} />
                  <button type="button" onClick={() => { const arr = [...(c.headers as Record<string, unknown>[] ?? [])]; arr.splice(i, 1); set("headers", arr); }} className="px-1.5 text-muted-foreground hover:text-destructive text-lg leading-none">×</button>
                </div>
              ))}
              <button type="button" onClick={() => set("headers", [...(Array.isArray(c.headers) ? c.headers as Record<string, unknown>[] : []), { key: "", value: "" }])} className="text-[12px] font-semibold text-primary hover:underline">{t("automation.addHeader")}</button>
            </div>
          </Field>
          <Field label={t("automation.body")}><textarea value={String(c.body ?? "")} onChange={(e) => set("body", e.target.value)} rows={4} placeholder={'{"name": "{full_name}", "phone": "{phone}"}'} className={cn(INP, "resize-none h-auto py-2")} /></Field>
          <p className="text-[12px] text-muted-foreground">{t("automation.urlHeadersAndBodySupport")} {"{first_name}"}, {"{full_name}"}, {"{phone}"} {t("automation.andContactAttributes")}</p>
        </>}
        {kind === "condition" && <>
          <Field label={t("automation.contactAttribute")}><input value={String(c.attribute ?? "")} onChange={(e) => set("attribute", e.target.value)} placeholder={t("automation.eGReModelPhone")} className={INP} /></Field>
          <Field label={t("automation.operator")}><Select value={String(c.operator ?? "equals")} onChange={(v) => set("operator", v)} searchable={false} options={[["equals", "Equals"], ["not_equals", "Not equals"], ["contains", "Contains"], ["is_set", "Is set"], ["is_not_set", "Is not set"]].map(([v, l]) => ({ value: v, label: l }))} className="w-full" /></Field>
          {c.operator !== "is_set" && c.operator !== "is_not_set" && (
            <Field label={t("automation.value")}><input value={String(c.value ?? "")} onChange={(e) => set("value", e.target.value)} placeholder={t("automation.eGBrioRs")} className={INP} /></Field>
          )}
          <p className="text-[12px] text-muted-foreground">{t("automation.connectThe")} <b className="text-emerald-600">{t("automation.match")}</b> {t("automation.handleForWhenItS")} <b className="text-slate-500">{t("automation.else")}</b> {t("automation.forEverythingElse")}</p>
        </>}
      </div>
      {!isTrigger && (
        <div className="px-4 py-3 border-t border-border">
          <button onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 h-9 w-full justify-center rounded-md border border-destructive/30 text-destructive text-[13px] font-semibold hover:bg-destructive/10 outline-none transition-colors"><Trash2 className="w-4 h-4" /> {t("automation.deleteNode")}</button>
        </div>
      )}
    </>
  );
}

const INP = "w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-[12px] font-bold text-foreground/80">{label}</label>{children}</div>;
}

// Multi-row contact-attribute mapping (attribute -> value, value supports
// {placeholders}). Matches the SmartKonek "Set Contact Attribute" node.
type AttrRow = { attribute?: string; value?: string };
function AttrMappings({ c, onChange }: { c: Record<string, unknown>; onChange: (cfg: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const rows: AttrRow[] = Array.isArray(c.mappings)
    ? (c.mappings as AttrRow[])
    : (c.key ? [{ attribute: String(c.key), value: String(c.value ?? "") }] : [{ attribute: "", value: "" }]);
  const setRows = (r: AttrRow[]) => onChange({ ...c, mappings: r, key: undefined, value: undefined });
  return (
    <Field label={t("automation.attributeMappings")}>
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={row.attribute ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, attribute: e.target.value } : x)))}
              placeholder="attribute" className="w-[42%] h-8 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary" />
            <input value={row.value ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              placeholder={t("automation.valueOrField")} className="flex-1 h-8 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary" />
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-muted shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button onClick={() => setRows([...rows, { attribute: "", value: "" }])}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-dashed border-border text-sm text-primary hover:bg-muted font-medium"><Plus className="w-3.5 h-3.5" /> {t("automation.addMapping")}</button>
        <p className="text-[11.5px] text-muted-foreground">{t("automation.use")} {"{first_name}"}, {"{full_name}"}, {"{phone}"} {t("automation.orAnyContactAttributeIn")}</p>
      </div>
    </Field>
  );
}

// Shows the Google service-account email to share the sheet with (+ copy).
function ShareWithSA({ email }: { email: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  if (!email) return <p className="text-[12px] text-amber-600">{t("automation.googleSheetsIsnTConnected")}</p>;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-2.5">
      <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("automation.shareYourGoogleSheetEditor")}</p>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 text-[11px] text-foreground break-all">{email}</code>
        <button onClick={() => { navigator.clipboard?.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 px-2 h-6 rounded border border-border text-[11px] font-medium hover:bg-muted outline-none">{copied ? t("automation.copied") : t("automation.copy")}</button>
      </div>
    </div>
  );
}

export default function FlowBuilderPage() {
  return <ReactFlowProvider><Builder /></ReactFlowProvider>;
}
