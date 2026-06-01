// Uji realtime routing: connect WS, picu handoff, pastikan event
// conversation.assigned tersiar ke dashboard.
const ORG = "00000000-0000-0000-0000-0000000000a1";
const PNID = "1234567890";
const ws = new WebSocket(`ws://localhost:8082/ws?org=${ORG}`);
const seen = new Set();

ws.addEventListener("open", async () => {
  console.log("WS connected, memicu handoff...");
  await fetch("http://localhost:8080/webhook/whatsapp", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "demo-waba",
      changes: [{ field: "messages", value: {
        messaging_product: "whatsapp", metadata: { phone_number_id: PNID },
        contacts: [{ wa_id: "628555444", profile: { name: "Tono" } }],
        messages: [{ from: "628555444", id: "wamid.WSRO" + Date.now(), timestamp: "1700000010",
          type: "text", text: { body: "tolong eskalasi ke manusia, ada masalah pembayaran kompleks" } }],
      }}]}]}),
  });
});

ws.addEventListener("message", (ev) => {
  const env = JSON.parse(ev.data);
  seen.add(env.type);
  let extra = "";
  if (env.type === "conversation.assigned") extra = ` agent=${env.data.agent_name}`;
  console.log(`>> ${env.type}${extra}`);
});

setTimeout(() => {
  const ok = seen.has("conversation.assigned");
  console.log(`\n${ok ? "OK" : "GAGAL"}: types diterima = [${[...seen].join(", ")}]`);
  ws.close();
  process.exit(ok ? 0 : 1);
}, 7000);
