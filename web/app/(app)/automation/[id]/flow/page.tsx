"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Plus, Zap, MessageCircle, FileText, User, Users, Tag, Flag,
  CheckCircle, Globe, GitFork, Trash2, Loader2, X, Save,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";

import { api } from "@/lib/api";
import { ACTIONS, TRIGGERS, triggerLabel } from "@/lib/automationMeta";
import { cn } from "@/lib/utils";
import type { AutomationDetail } from "@/lib/types";

// ── Node catalog ────────────────────────────────────────────────────────────
type Meta = { label: string; Icon: LucideIcon; accent: string; kicker: string; desc: string };
const META: Record<string, Meta> = {
  trigger: { label: "Trigger", Icon: Zap, accent: "#F59E0B", kicker: "WHEN", desc: "Flow entry point" },
  condition: { label: "Condition", Icon: GitFork, accent: "#8B5CF6", kicker: "IF", desc: "Branch on a condition" },
  send_message: { label: "Send auto reply", Icon: MessageCircle, accent: "#2D8B73", kicker: "DO", desc: ACTIONS.send_message.desc },
  send_template: { label: "Send template", Icon: FileText, accent: "#2D8B73", kicker: "DO", desc: ACTIONS.send_template.desc },
  assign_agent: { label: "Assign to agent", Icon: User, accent: "#0891B2", kicker: "DO", desc: ACTIONS.assign_agent.desc },
  assign_team: { label: "Assign to department", Icon: Users, accent: "#0891B2", kicker: "DO", desc: ACTIONS.assign_team.desc },
  add_tag: { label: "Add tag", Icon: Tag, accent: "#D97706", kicker: "DO", desc: ACTIONS.add_tag.desc },
  remove_tag: { label: "Remove tag", Icon: Tag, accent: "#D97706", kicker: "DO", desc: ACTIONS.remove_tag.desc },
  set_priority: { label: "Set priority", Icon: Flag, accent: "#DC2626", kicker: "DO", desc: ACTIONS.set_priority.desc },
  close_conversation: { label: "Close conversation", Icon: CheckCircle, accent: "#475569", kicker: "DO", desc: ACTIONS.close_conversation.desc },
  webhook_notify: { label: "Webhook", Icon: Globe, accent: "#475569", kicker: "DO", desc: ACTIONS.webhook_notify.desc },
};
const meta = (k: string) => META[k] ?? META.send_message;

const PALETTE: { group: string; kinds: string[] }[] = [
  { group: "Logic", kinds: ["condition"] },
  { group: "Messaging", kinds: ["send_message", "send_template"] },
  { group: "Routing", kinds: ["assign_agent", "assign_team"] },
  { group: "Contact", kinds: ["add_tag", "remove_tag", "set_priority"] },
  { group: "Flow control", kinds: ["close_conversation", "webhook_notify"] },
];
// The executor runs these; others are configurable but not yet executed.
const EXECUTED = new Set(["send_message", "add_tag", "remove_tag", "assign_agent", "close_conversation", "webhook_notify"]);

type NodeData = { kind: string; config: Record<string, unknown>; triggerType?: string };
type AppNode = Node<NodeData>;

function summary(kind: string, c: Record<string, unknown>, triggerType?: string): string {
  switch (kind) {
    case "trigger": return TRIGGERS[triggerType ?? ""]?.desc ?? "Entry point";
    case "send_message": return String(c.message || "No message set");
    case "send_template": return `Template: ${c.template_name || "—"}`;
    case "assign_agent": return `Agent: ${c.agent_name || c.agent_id || "—"}`;
    case "assign_team": return `Queue: ${c.queue || "—"}`;
    case "add_tag": case "remove_tag": return `Tags: ${(Array.isArray(c.tags) ? (c.tags as string[]).join(", ") : "") || "—"}`;
    case "set_priority": return `Priority: ${c.priority || "normal"}`;
    case "webhook_notify": return String(c.url || "No URL set");
    case "condition": return String(c.expression || "Define condition");
    case "close_conversation": return "Resolve and close";
    default: return ACTIONS[kind]?.desc ?? "";
  }
}

// ── Custom node ─────────────────────────────────────────────────────────────
function FlowNode({ data, selected }: NodeProps<AppNode>) {
  const m = meta(data.kind);
  const title = data.kind === "trigger" ? triggerLabel(data.triggerType ?? "") : m.label;
  const isTrigger = data.kind === "trigger";
  return (
    <div className={cn(
      "w-[260px] rounded-lg bg-card border-[1.5px] shadow-sm transition-shadow",
      selected ? "border-primary shadow-lg" : "border-border hover:shadow-md",
    )}>
      {!isTrigger && <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-muted-foreground !border-2 !border-card" />}
      <div className="p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: m.accent + "1a", color: m.accent }}>
            <m.Icon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold tracking-[0.09em]" style={{ color: m.accent }}>{m.kicker}</p>
            <p className="text-[13px] font-bold text-foreground leading-tight truncate">{title}</p>
          </div>
          {!isTrigger && !EXECUTED.has(data.kind) && (
            <Tip label="Configurable, not yet executed by the engine"><span className="text-[8.5px] font-bold uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">soon</span></Tip>
          )}
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-2 line-clamp-2 break-words">{summary(data.kind, data.config, data.triggerType)}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-card" />
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
  const edges: Edge[] = (flow.edges ?? []).map((e, i) => ({ id: `e${i}-${e.from}-${e.to}`, source: e.from, target: e.to }));
  return { nodes, edges };
}

function toModel(nodes: AppNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.kind, x: Math.round(n.position.x), y: Math.round(n.position.y), config: n.data.config })),
    edges: edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

// ── Page ────────────────────────────────────────────────────────────────────
function Builder() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [auto, setAuto] = useState<AutomationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    api.getAutomation(id).then((a) => {
      const { nodes: n, edges: e } = toRF(a);
      setAuto(a); setActive(a.is_active); setNodes(n); setEdges(e); setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const onConnect = useCallback((c: Connection) => { setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#94A3B8", strokeWidth: 1.6 } }, eds)); setDirty(true); }, [setEdges]);
  const markDirty = useCallback(() => setDirty(true), []);

  function addNode(kind: string) {
    setPaletteOpen(false);
    const rect = wrapRef.current?.getBoundingClientRect();
    const pos = rect ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 240, y: 240 };
    const nid = `n${Date.now()}`;
    setNodes((nds) => [...nds, { id: nid, type: "flowNode", position: pos, data: { kind, config: {} } }]);
    setSelId(nid); setDirty(true);
  }

  function updateConfig(nodeId: string, config: Record<string, unknown>) {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n)));
    setDirty(true);
  }
  function deleteNode(nodeId: string) {
    if (nodeId === "trigger") { setToast("The trigger can't be deleted"); return; }
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelId(null); setDirty(true);
  }

  async function save() {
    if (!auto) return;
    setSaving(true);
    const model = toModel(nodes, edges);
    const trig = nodes.find((n) => n.data.kind === "trigger");
    try {
      await api.updateAutomation(auto.id, { flow: model, ...(trig ? { trigger_config: trig.data.config } : {}) });
      setDirty(false); setToast("Flow saved");
    } catch (e) { setToast(String(e)); }
    finally { setSaving(false); }
  }
  async function toggleActive() {
    if (!auto) return;
    const next = !active; setActive(next);
    try { await api.updateAutomation(auto.id, { is_active: next }); }
    catch { setActive(!next); setToast("Could not update status"); }
  }

  const selected = useMemo(() => nodes.find((n) => n.id === selId) ?? null, [nodes, selId]);

  if (loading) return <div className="grid place-items-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!auto) return <div className="p-8 text-muted-foreground">Automation not found.</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0 z-10">
        <button onClick={() => router.push("/settings/automation")} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <p className="font-bold text-[15px] text-foreground truncate">{auto.name}</p>
          <p className="text-[11.5px] text-muted-foreground">Visual flow · {nodes.length} node{nodes.length === 1 ? "" : "s"} · trigger: {triggerLabel(auto.trigger_type)}</p>
        </div>
        <div className="flex-1" />
        <button onClick={() => setPaletteOpen((v) => !v)} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none"><Plus className="w-4 h-4" /> Add node</button>
        <label className="inline-flex items-center gap-2 cursor-pointer mx-1">
          <span className="relative inline-flex">
            <input type="checkbox" checked={active} onChange={toggleActive} className="sr-only peer" />
            <span className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:shadow after:transition-all peer-checked:after:translate-x-4" />
          </span>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{active ? "Active" : "Paused"}</span>
        </label>
        <button onClick={save} disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md disabled:opacity-50 transition-all outline-none">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{dirty ? "Save" : "Saved"}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative" ref={wrapRef}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" || x.type === "remove")) markDirty(); }}
          onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === "remove")) markDirty(); }}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelId(n.id)}
          onPaneClick={() => { setSelId(null); setPaletteOpen(false); }}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: true, style: { stroke: "#94A3B8", strokeWidth: 1.6 } }}
          deleteKeyCode={["Backspace", "Delete"]}
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
                        <p className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">{m.label}{!EXECUTED.has(k) && <span className="text-[8px] font-bold uppercase text-amber-600">soon</span>}</p>
                        <p className="text-[10.5px] text-muted-foreground truncate">{m.desc}</p>
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
            <Inspector node={selected} triggerType={auto.trigger_type} onChange={(cfg) => updateConfig(selected.id, cfg)} onClose={() => setSelId(null)} onDelete={() => deleteNode(selected.id)} />
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] animate-scale-in">
          <div className="px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold shadow-xl">{toast}</div>
        </div>
      )}
    </div>
  );
}

// ── Inspector (per-node config) ─────────────────────────────────────────────
function Inspector({ node, triggerType, onChange, onClose, onDelete }: {
  node: AppNode; triggerType: string; onChange: (cfg: Record<string, unknown>) => void; onClose: () => void; onDelete: () => void;
}) {
  const kind = node.data.kind;
  const c = node.data.config || {};
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v });
  const m = meta(kind);
  const isTrigger = kind === "trigger";

  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <div className="w-8 h-8 rounded-md grid place-items-center shrink-0" style={{ backgroundColor: m.accent + "1a", color: m.accent }}><m.Icon className="w-[17px] h-[17px]" /></div>
        <p className="font-bold text-[14px] text-foreground flex-1 truncate">{isTrigger ? triggerLabel(triggerType) : m.label}</p>
        <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted outline-none"><X className="w-[18px] h-[18px]" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!isTrigger && !EXECUTED.has(kind) && (
          <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-700 font-medium">Configurable now; the engine doesn&apos;t execute this action type yet.</div>
        )}
        {isTrigger && triggerType === "keyword_match" && (
          <Field label="Keywords (comma separated)"><input value={Array.isArray(c.keywords) ? (c.keywords as string[]).join(", ") : ""} onChange={(e) => set("keywords", e.target.value.split(",").map((k) => k.trim()).filter(Boolean))} placeholder="price, promo, harga" className={INP} /></Field>
        )}
        {isTrigger && triggerType === "conversation_idle" && (
          <Field label="Idle minutes"><input type="number" value={String(c.idle_minutes ?? "30")} onChange={(e) => set("idle_minutes", Number(e.target.value) || 30)} className={INP} /></Field>
        )}
        {isTrigger && triggerType === "button_click" && (
          <Field label="Callback id contains (optional)"><input value={String(c.callback ?? "")} onChange={(e) => set("callback", e.target.value)} placeholder="e.g. daftar (blank = any button)" className={INP} /></Field>
        )}
        {isTrigger && triggerType !== "keyword_match" && triggerType !== "conversation_idle" && triggerType !== "button_click" && (
          <p className="text-[13px] text-muted-foreground">{TRIGGERS[triggerType]?.desc ?? "Fires on the configured event."} No extra configuration needed.</p>
        )}
        {kind === "send_message" && <Field label="Message"><textarea value={String(c.message ?? "")} onChange={(e) => set("message", e.target.value)} rows={4} placeholder="Type the auto reply..." className={cn(INP, "resize-none h-auto py-2")} /></Field>}
        {kind === "send_template" && <Field label="Template name"><input value={String(c.template_name ?? "")} onChange={(e) => set("template_name", e.target.value)} placeholder="welcome_v1" className={INP} /></Field>}
        {kind === "assign_agent" && <Field label="Agent name or ID"><input value={String(c.agent_name ?? "")} onChange={(e) => set("agent_name", e.target.value)} placeholder="e.g. Agent Satu" className={INP} /></Field>}
        {kind === "assign_team" && <Field label="Department / queue"><input value={String(c.queue ?? "")} onChange={(e) => set("queue", e.target.value)} placeholder="sales" className={INP} /></Field>}
        {(kind === "add_tag" || kind === "remove_tag") && <Field label="Tags (comma separated)"><input value={Array.isArray(c.tags) ? (c.tags as string[]).join(", ") : ""} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} placeholder="vip, pricing" className={INP} /></Field>}
        {kind === "set_priority" && <Field label="Priority"><select value={String(c.priority ?? "normal")} onChange={(e) => set("priority", e.target.value)} className={INP}>{["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>}
        {kind === "webhook_notify" && <Field label="Webhook URL"><input value={String(c.url ?? "")} onChange={(e) => set("url", e.target.value)} placeholder="https://..." className={INP} /></Field>}
        {kind === "condition" && <Field label="Condition expression"><input value={String(c.expression ?? "")} onChange={(e) => set("expression", e.target.value)} placeholder="message contains 'refund'" className={INP} /></Field>}
        {kind === "close_conversation" && <p className="text-[13px] text-muted-foreground">Resolves and closes the conversation. No configuration needed.</p>}
      </div>
      {!isTrigger && (
        <div className="px-4 py-3 border-t border-border">
          <button onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 h-9 w-full justify-center rounded-md border border-destructive/30 text-destructive text-[13px] font-semibold hover:bg-destructive/10 outline-none transition-colors"><Trash2 className="w-4 h-4" /> Delete node</button>
        </div>
      )}
    </>
  );
}

const INP = "w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-[12px] font-bold text-foreground/80">{label}</label>{children}</div>;
}

export default function FlowBuilderPage() {
  return <ReactFlowProvider><Builder /></ReactFlowProvider>;
}
