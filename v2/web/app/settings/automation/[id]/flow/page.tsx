"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box, Typography, Button, IconButton, Switch, Tooltip, Drawer, TextField, Select,
  MenuItem, Menu, Snackbar, Alert, Divider, CircularProgress,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import HttpRoundedIcon from "@mui/icons-material/HttpRounded";
import CallSplitRoundedIcon from "@mui/icons-material/CallSplitRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import { type SvgIconComponent } from "@mui/icons-material";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { ACTIONS, actionLabel, triggerLabel, TRIGGERS } from "@/lib/automationMeta";
import type { AutomationDetail, FlowNode } from "@/lib/types";

type Step = { id: string; type: string; config: Record<string, unknown> };

const NODE_ICON: Record<string, SvgIconComponent> = {
  trigger: BoltRoundedIcon,
  send_message: ChatBubbleOutlineRoundedIcon,
  send_template: DescriptionOutlinedIcon,
  assign_agent: PersonOutlineRoundedIcon,
  assign_team: GroupsOutlinedIcon,
  add_tag: LocalOfferOutlinedIcon,
  remove_tag: LocalOfferOutlinedIcon,
  set_priority: FlagOutlinedIcon,
  close_conversation: CheckCircleOutlineRoundedIcon,
  webhook_notify: HttpRoundedIcon,
  condition: CallSplitRoundedIcon,
};

// Palette: what you can add, grouped like the v1 builder.
const PALETTE: { group: string; types: string[] }[] = [
  { group: "Logic", types: ["condition"] },
  { group: "Messaging", types: ["send_message", "send_template"] },
  { group: "Routing", types: ["assign_agent", "assign_team"] },
  { group: "Contact", types: ["add_tag", "remove_tag", "set_priority"] },
  { group: "Flow control", types: ["close_conversation", "webhook_notify"] },
];

function nodeLabel(type: string) { return type === "condition" ? "Condition" : actionLabel(type); }

function linearize(flow: AutomationDetail["flow"]): Step[] {
  const nodes = flow?.nodes ?? [];
  const edges = flow?.edges ?? [];
  const byId: Record<string, FlowNode> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const trigger = nodes.find((n) => n.type === "trigger");
  const nextOf: Record<string, string> = {};
  edges.forEach((e) => { nextOf[e.from] = e.to; });
  const order: FlowNode[] = [];
  const seen = new Set<string>();
  let cur = trigger ? nextOf[trigger.id] : undefined;
  while (cur && byId[cur] && !seen.has(cur)) { seen.add(cur); order.push(byId[cur]); cur = nextOf[cur]; }
  const steps = (order.length ? order : nodes.filter((n) => n.type !== "trigger"));
  return steps.map((n) => ({ id: n.id, type: n.type, config: n.config ?? {} }));
}

function serialize(triggerConfig: Record<string, unknown>, steps: Step[]) {
  const nodes: FlowNode[] = [{ id: "trigger", type: "trigger", x: 40, y: 40, config: triggerConfig }];
  const edges: { from: string; to: string }[] = [];
  let prev = "trigger";
  steps.forEach((s, i) => {
    nodes.push({ id: s.id, type: s.type, x: 40, y: 200 + i * 150, config: s.config });
    edges.push({ from: prev, to: s.id });
    prev = s.id;
  });
  return { nodes, edges };
}

function summary(step: Step): string {
  const c = step.config || {};
  switch (step.type) {
    case "send_message": return String(c.message || "No message set");
    case "send_template": return `Template: ${c.template_name || "—"}`;
    case "assign_agent": return `Agent: ${c.agent_name || c.agent_id || "—"}`;
    case "assign_team": return `Queue: ${c.queue || "—"}`;
    case "add_tag":
    case "remove_tag": return `Tags: ${(Array.isArray(c.tags) ? (c.tags as string[]).join(", ") : "") || "—"}`;
    case "set_priority": return `Priority: ${c.priority || "normal"}`;
    case "webhook_notify": return String(c.url || "No URL set");
    case "condition": return String(c.expression || "Define condition");
    case "close_conversation": return "Resolve and close";
    default: return ACTIONS[step.type]?.desc ?? "";
  }
}

export default function FlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [auto, setAuto] = useState<AutomationDetail | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [paletteAnchor, setPaletteAnchor] = useState<null | HTMLElement>(null);
  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  useEffect(() => {
    api.getAutomation(id).then((a) => { setAuto(a); setSteps(linearize(a.flow)); setLoading(false); })
      .catch((e) => { setToast({ msg: String(e), sev: "error" }); setLoading(false); });
  }, [id]);

  const triggerConfig = useMemo(() => (auto?.trigger_config ?? {}) as Record<string, unknown>, [auto]);

  function mutate(next: Step[]) { setSteps(next); setDirty(true); }
  function addStep(type: string) {
    setPaletteAnchor(null);
    const step: Step = { id: `n${Date.now()}`, type, config: {} };
    mutate([...steps, step]);
    setEditIndex(steps.length);
  }
  function removeStep(i: number) { mutate(steps.filter((_, idx) => idx !== i)); setEditIndex(null); }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  }
  function updateStep(i: number, config: Record<string, unknown>) {
    mutate(steps.map((s, idx) => (idx === i ? { ...s, config } : s)));
  }

  async function save() {
    if (!auto) return;
    setSaving(true);
    try {
      await api.updateAutomation(auto.id, { flow: serialize(triggerConfig, steps) });
      setDirty(false);
      setToast({ msg: "Flow saved", sev: "success" });
    } catch (e) { setToast({ msg: String(e), sev: "error" }); }
    finally { setSaving(false); }
  }
  async function toggleActive() {
    if (!auto) return;
    try { await api.updateAutomation(auto.id, { is_active: !auto.is_active }); setAuto({ ...auto, is_active: !auto.is_active }); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  if (loading) return <Shell><Box sx={{ display: "grid", placeItems: "center", height: "100%" }}><CircularProgress /></Box></Shell>;
  if (!auto) return <Shell><Box sx={{ p: 4 }}>Automation not found.</Box></Shell>;

  return (
    <Shell>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        {/* Builder header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
          <IconButton size="small" onClick={() => router.push("/settings/automation")}><ArrowBackRoundedIcon /></IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }} noWrap>{auto.name}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Visual flow · {steps.length} step{steps.length === 1 ? "" : "s"}</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={auto.is_active ? "Active" : "Paused"}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Switch size="small" checked={auto.is_active} onChange={toggleActive} />
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{auto.is_active ? "Active" : "Paused"}</Typography>
            </Box>
          </Tooltip>
          <Button variant="contained" onClick={save} disabled={saving || !dirty}>{saving ? "Saving..." : dirty ? "Save" : "Saved"}</Button>
        </Box>

        {/* Canvas */}
        <Box sx={{ flex: 1, overflow: "auto", bgcolor: "background.default", py: 5,
          backgroundImage: "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
          <Box sx={{ width: 420, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Trigger node */}
            <NodeCard
              icon={BoltRoundedIcon} accent="#F59E0B" kicker="WHEN"
              title={triggerLabel(auto.trigger_type)} body={TRIGGERS[auto.trigger_type]?.desc ?? ""}
              onClick={() => {}}
            />
            <Connector />

            {steps.map((s, i) => (
              <Box key={s.id} sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <NodeCard
                  icon={NODE_ICON[s.type] ?? ChatBubbleOutlineRoundedIcon}
                  accent={s.type === "condition" ? "#8B5CF6" : "#2D8B73"}
                  kicker={s.type === "condition" ? "IF" : i === 0 ? "DO" : "THEN"}
                  title={nodeLabel(s.type)} body={summary(s)}
                  selected={editIndex === i}
                  onClick={() => setEditIndex(i)}
                  actions={
                    <>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i === 0}><ArrowUpwardRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i === steps.length - 1}><ArrowDownwardRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); removeStep(i); }} sx={{ color: "error.main" }}><DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} /></IconButton>
                    </>
                  }
                />
                <Connector />
              </Box>
            ))}

            {/* Add step */}
            <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={(e) => setPaletteAnchor(e.currentTarget)}
              sx={{ bgcolor: "background.paper", borderStyle: "dashed" }}>
              Add step
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Palette menu */}
      <Menu anchorEl={paletteAnchor} open={!!paletteAnchor} onClose={() => setPaletteAnchor(null)}
        slotProps={{ paper: { sx: { width: 280, maxHeight: 440 } } }}>
        {PALETTE.map((grp) => [
          <Typography key={grp.group} sx={{ px: 2, pt: 1.25, pb: 0.5, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary", textTransform: "uppercase" }}>{grp.group}</Typography>,
          ...grp.types.map((t) => {
            const Icon = NODE_ICON[t] ?? ChatBubbleOutlineRoundedIcon;
            return (
              <MenuItem key={t} onClick={() => addStep(t)} sx={{ gap: 1.25 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: t === "condition" ? "rgba(139,92,246,0.12)" : "action.selected", color: t === "condition" ? "#8B5CF6" : "primary.main" }}>
                  <Icon sx={{ fontSize: 16 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{nodeLabel(t)}</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{t === "condition" ? "Branch on a condition" : ACTIONS[t]?.desc}</Typography>
                </Box>
              </MenuItem>
            );
          }),
        ])}
      </Menu>

      {/* Config drawer */}
      <Drawer anchor="right" open={editIndex !== null} onClose={() => setEditIndex(null)}
        slotProps={{ paper: { sx: { width: 380 } } }}>
        {editIndex !== null && steps[editIndex] && (
          <NodeConfig step={steps[editIndex]} onChange={(cfg) => updateStep(editIndex, cfg)} onClose={() => setEditIndex(null)} />
        )}
      </Drawer>

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Shell>
  );
}

function Connector() {
  return <Box sx={{ width: 2, height: 28, bgcolor: "divider" }} />;
}

function NodeCard({ icon: Icon, accent, kicker, title, body, onClick, selected, actions }: {
  icon: SvgIconComponent; accent: string; kicker: string; title: string; body: string;
  onClick: () => void; selected?: boolean; actions?: React.ReactNode;
}) {
  return (
    <Box onClick={onClick} sx={{
      width: 360, bgcolor: "background.paper", borderRadius: "8px", p: 2, cursor: "pointer",
      border: "1.5px solid", borderColor: selected ? "primary.main" : "divider",
      boxShadow: selected ? 3 : 1, transition: "box-shadow .15s, border-color .15s",
      "&:hover": { boxShadow: 3 }, position: "relative",
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ width: 38, height: 38, borderRadius: "8px", display: "grid", placeItems: "center", flexShrink: 0, bgcolor: `${accent}1a`, color: accent }}>
          <Icon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: accent }}>{kicker}</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }} noWrap>{title}</Typography>
        </Box>
        {actions && <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex" }}>{actions}</Box>}
      </Box>
      {body && <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 1, ml: 0.25 }} noWrap>{body}</Typography>}
    </Box>
  );
}

function NodeConfig({ step, onChange, onClose }: { step: Step; onChange: (cfg: Record<string, unknown>) => void; onClose: () => void }) {
  const c = step.config || {};
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v });
  const Icon = NODE_ICON[step.type] ?? ChatBubbleOutlineRoundedIcon;
  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "action.selected", color: "primary.main" }}><Icon /></Box>
        <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{nodeLabel(step.type)}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onClose}>Done</Button>
      </Box>
      <Divider />
      {step.type === "send_message" && (
        <Field label="Message"><TextField fullWidth multiline minRows={3} value={String(c.message ?? "")} onChange={(e) => set("message", e.target.value)} placeholder="Type the reply..." /></Field>
      )}
      {step.type === "send_template" && (
        <Field label="Template name"><TextField fullWidth value={String(c.template_name ?? "")} onChange={(e) => set("template_name", e.target.value)} placeholder="welcome_v1" /></Field>
      )}
      {step.type === "assign_agent" && (
        <Field label="Agent name or ID"><TextField fullWidth value={String(c.agent_name ?? "")} onChange={(e) => set("agent_name", e.target.value)} /></Field>
      )}
      {step.type === "assign_team" && (
        <Field label="Department / queue"><TextField fullWidth value={String(c.queue ?? "")} onChange={(e) => set("queue", e.target.value)} placeholder="sales" /></Field>
      )}
      {(step.type === "add_tag" || step.type === "remove_tag") && (
        <Field label="Tags (comma separated)">
          <TextField fullWidth value={Array.isArray(c.tags) ? (c.tags as string[]).join(", ") : ""}
            onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} placeholder="pricing, vip" />
        </Field>
      )}
      {step.type === "set_priority" && (
        <Field label="Priority">
          <Select fullWidth size="small" value={String(c.priority ?? "normal")} onChange={(e) => set("priority", e.target.value)}>
            {["low", "normal", "high", "urgent"].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </Field>
      )}
      {step.type === "webhook_notify" && (
        <Field label="Webhook URL"><TextField fullWidth value={String(c.url ?? "")} onChange={(e) => set("url", e.target.value)} placeholder="https://..." /></Field>
      )}
      {step.type === "condition" && (
        <Field label="Condition expression">
          <TextField fullWidth value={String(c.expression ?? "")} onChange={(e) => set("expression", e.target.value)} placeholder="message contains 'refund'" />
        </Field>
      )}
      {step.type === "close_conversation" && (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>This step resolves and closes the conversation. No configuration needed.</Typography>
      )}
    </Box>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>{label}</Typography>
      {children}
    </Box>
  );
}
