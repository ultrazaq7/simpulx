// Uji realtime: connect WS, picu webhook, pastikan event tersiar ke dashboard.
const ORG = "00000000-0000-0000-0000-0000000000a1";
const PNID = "1234567890";

const ws = new WebSocket(`ws://localhost:8082/ws?org=${ORG}`);
let got = 0;

ws.addEventListener("open", async () => {
  console.log("WS connected, memicu webhook...");
  await fetch("http://localhost:8080/webhook/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "demo-waba", changes: [{ field: "messages", value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: PNID },
        contacts: [{ wa_id: "628777666555", profile: { name: "Rian" } }],
        messages: [{ from: "628777666555", id: "wamid.WSTEST" + Date.now(),
          timestamp: "1700000002", type: "text",
          text: { body: "jam buka hari sabtu?" } }],
      }}]}],
    }),
  });
});

ws.addEventListener("message", (ev) => {
  got++;
  const env = JSON.parse(ev.data);
  console.log(`>> broadcast diterima: type=${env.type} direction=${env.data?.direction} preview="${(env.data?.preview||"").slice(0,40)}"`);
});

setTimeout(() => {
  console.log(got > 0 ? `\nOK: ${got} event tersiar via WebSocket.` : "\nGAGAL: tidak ada broadcast.");
  ws.close();
  process.exit(got > 0 ? 0 : 1);
}, 6000);
