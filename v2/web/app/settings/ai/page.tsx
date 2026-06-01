"use client";
import { useEffect, useState } from "react";
import { Box, Typography, TextField, Button, Switch, Slider, Select, MenuItem, FormControl, InputLabel, CircularProgress, Divider } from "@mui/material";
import { api } from "@/lib/api";
import type { AIAgent } from "@/lib/types";
import { useToast, PageBody } from "../_shared";

export default function AISettingsPage() {
  const { notify, ToastHost } = useToast();
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [originalAgent, setOriginalAgent] = useState<AIAgent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [llmModels, setLlmModels] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.getAIAgent().then((a) => { setAgent(a); setOriginalAgent(a); }).catch(() => {});
    api.listLLMModels().then(setLlmModels).catch(() => {});
  }, []);

  function update(patch: Partial<AIAgent>) { if (agent) setAgent({ ...agent, ...patch }); }

  async function save() {
    if (!agent) return;
    setSaving(true);
    try { await api.updateAIAgent(agent); setOriginalAgent(agent); setIsEditing(false); notify("Settings saved!"); }
    catch { notify("Failed to save", "error"); }
    finally { setSaving(false); }
  }
  function cancel() { if (originalAgent) setAgent(originalAgent); setIsEditing(false); }

  if (!agent) return <PageBody><Box sx={{ display: "flex", justifyContent: "center", py: 10 }}><CircularProgress /></Box></PageBody>;

  return (
    <PageBody maxWidth={680}>
      {ToastHost}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Basic settings */}
        <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "#FAFBFC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>Basic settings</Typography>
            {!isEditing && (
              <Button variant="outlined" size="small" onClick={() => setIsEditing(true)} sx={{ textTransform: "none", fontWeight: 600, borderRadius: "8px", py: 0.25, px: 1.5 }}>Edit</Button>
            )}
          </Box>
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
            {!isEditing ? (
              <>
                <Field label="Agent name" value={agent.name} />
                <Field label="System prompt" value={agent.system_prompt || "—"} pre />
                <Field label="Model" value={llmModels.find((m) => m.id === agent.model)?.name || agent.model} />
              </>
            ) : (
              <>
                <TextField label="Agent name" value={agent.name} onChange={(e) => update({ name: e.target.value })} fullWidth size="small" />
                <TextField label="System prompt" value={agent.system_prompt} onChange={(e) => update({ system_prompt: e.target.value })} fullWidth multiline rows={5} size="small"
                  placeholder="Instructions for how the AI should behave, respond, and handle conversations" />
                <FormControl fullWidth size="small">
                  <InputLabel>Model</InputLabel>
                  <Select label="Model" value={agent.model} onChange={(e) => update({ model: e.target.value as string })}>
                    {llmModels.length === 0
                      ? <MenuItem value={agent.model}>{agent.model} (Loading list...)</MenuItem>
                      : llmModels.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </>
            )}
          </Box>
        </Box>

        {/* Fine tuning */}
        <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "#FAFBFC" }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>Fine tuning</Typography>
          </Box>
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            {!isEditing ? (
              <>
                <Row label="Temperature" value={agent.temperature.toFixed(2)} />
                <Row label="Handoff threshold" value={agent.handoff_threshold.toFixed(2)} />
                <Divider />
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Agent active</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>Enable or disable the AI agent globally</Typography>
                  </Box>
                  <Switch checked={agent.is_active} disabled />
                </Box>
              </>
            ) : (
              <>
                <Box sx={{ px: 1 }}>
                  <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 600 }}>Temperature: {agent.temperature.toFixed(2)}</Typography>
                  <Slider value={agent.temperature} min={0} max={2} step={0.05} onChange={(_, v) => update({ temperature: v as number })}
                    sx={{ mx: 1, width: "calc(100% - 16px)", "& .MuiSlider-markLabel": { fontSize: 11, color: "text.secondary" } }}
                    marks={[{ value: 0, label: "Precise" }, { value: 1, label: "Balanced" }, { value: 2, label: "Creative" }]} />
                </Box>
                <Box sx={{ px: 1 }}>
                  <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 600 }}>Handoff threshold: {agent.handoff_threshold.toFixed(2)}</Typography>
                  <Slider value={agent.handoff_threshold} min={0} max={1} step={0.05} onChange={(_, v) => update({ handoff_threshold: v as number })}
                    sx={{ mx: 1, width: "calc(100% - 16px)", "& .MuiSlider-markLabel": { fontSize: 11, color: "text.secondary" } }}
                    marks={[{ value: 0, label: "Sensitive" }, { value: 0.5, label: "Balanced" }, { value: 1, label: "Confident" }]} />
                </Box>
                <Divider />
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Agent active</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>Enable or disable the AI agent globally</Typography>
                  </Box>
                  <Switch checked={agent.is_active} onChange={(e) => update({ is_active: e.target.checked })} />
                </Box>
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
                  <Button variant="text" onClick={cancel} disabled={saving} sx={{ borderRadius: "8px", fontWeight: 600, textTransform: "none", color: "text.secondary" }}>Cancel</Button>
                  <Button variant="contained" onClick={save} disabled={saving} sx={{ borderRadius: "8px", fontWeight: 600, textTransform: "none", px: 3 }}>
                    {saving ? <CircularProgress size={16} color="inherit" /> : "Save"}
                  </Button>
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </PageBody>
  );
}

function Field({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 500, whiteSpace: pre ? "pre-wrap" : "normal" }}>{value}</Typography>
    </Box>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}
