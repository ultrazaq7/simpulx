import puppeteer from "puppeteer";

const API = "http://localhost:8080";
const WEB = "http://localhost:3000";

// 1) login via API untuk dapat token+user
const res = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "agent1@demo.id", password: "demo1234" }),
});
const { token, user } = await res.json();

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });

// inject session sebelum app script jalan
await page.evaluateOnNewDocument((t, u) => {
  localStorage.setItem("simpulx_token", t);
  localStorage.setItem("simpulx_user", JSON.stringify(u));
}, token, user);

async function shot(path, file, clickFirstConv = false) {
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  if (clickFirstConv) {
    const item = await page.$(".conv-item");
    if (item) {
      await item.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  await page.screenshot({ path: file });
  console.log("saved", file);
}

await shot("/dashboard", "shot-dashboard.png");
await shot("/broadcasts", "shot-broadcasts.png");
await shot("/contacts", "shot-contacts.png");
await shot("/channels", "shot-channels.png");
await shot("/settings", "shot-settings.png");
await shot("/knowledge", "shot-knowledge.png");

// Inbox: open a conversation, then pop the quick-reply menu.
await page.goto(`${WEB}/inbox`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1200));
const item = await page.$("[data-conv]");
if (item) { await item.click(); await new Promise((r) => setTimeout(r, 1200)); }
await page.screenshot({ path: "shot-inbox.png" });
console.log("saved shot-inbox.png");

// login page (tanpa sesi)
await page.evaluateOnNewDocument(() => {
  localStorage.removeItem("simpulx_token");
  localStorage.removeItem("simpulx_user");
});
const p2 = await browser.newPage();
await p2.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
await p2.goto(`${WEB}/login`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
await p2.screenshot({ path: "shot-login.png" });
console.log("saved shot-login.png");

await browser.close();
