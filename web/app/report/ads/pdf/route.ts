import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import puppeteer from "puppeteer";

// NOTE ON THE PATH: this handler lives under /report/* (NOT /api/*) on purpose.
// Caddy reverse-proxies every /api/* request to the Go gateway (deploy/docker/Caddyfile),
// so a Next API route at /api/... is shadowed and never reached from the browser -- the
// client got the gateway's 404 and fell back to window.print() (the dashboard). /report/*
// falls through Caddy's catch-all to the web container, so this route is actually reachable.

// Alpine's chromium package binary path varies (/usr/bin/chromium-browser on older
// releases, /usr/bin/chromium on newer). Resolve at runtime so launch doesn't fail
// on a wrong hardcoded path.
function resolveChrome(): string | undefined {
  for (const p of [process.env.PUPPETEER_EXECUTABLE_PATH, "/usr/bin/chromium-browser", "/usr/bin/chromium"]) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

// Server-side headless-Chromium PDF of the DEDICATED ads-report template
// (/report/ads), decoupled from the on-theme dashboard. Seeds the session token
// into localStorage, navigates to the print page, waits for the data to load and
// recharts to lay out ([data-report-ready="1"]), then prints. See memory
// ads-report-pdf-template.
//
// Navigation prefers the INTERNAL loopback (http://127.0.0.1:$PORT) so the page HTML
// is always reachable from inside the container -- no dependency on the public domain
// resolving/hairpinning back through Caddy/Cloudflare, which is the fragile part when
// a box tries to reach its own public hostname. The template's client-side api.* calls
// still hit the public NEXT_PUBLIC_API_URL, but the gateway sets CORS
// `Access-Control-Allow-Origin: *` (services/gateway/api.go), so those work cross-origin.
// If the loopback nav ever fails we fall back to the public origin.
// We DO NOT use networkidle0 -- the app shell keeps long-lived requests (fonts,
// lame.min.js, api) alive, so networkidle0 can hang past the timeout and throw, which
// is what made the client fall back to window.print() (the dashboard). domcontentloaded
// + an explicit wait on [data-report-ready] is deterministic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = { token?: string; user?: unknown; preset?: string; from?: string; to?: string; campaigns?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { body = {}; }
  if (!body.token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buildUrl = (origin: string) => {
    const u = new URL("/report/ads", origin);
    if (body.preset) u.searchParams.set("preset", body.preset);
    if (body.from) u.searchParams.set("from", body.from);
    if (body.to) u.searchParams.set("to", body.to);
    if (body.campaigns) u.searchParams.set("campaigns", body.campaigns);
    return u.toString();
  };
  // Primary = internal loopback (always reachable); fallback = public origin.
  const port = process.env.PORT || "3000";
  const internalUrl = buildUrl(`http://127.0.0.1:${port}`);
  const publicUrl = buildUrl(req.nextUrl.origin);

  const exe = resolveChrome();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({ headless: true, executablePath: exe, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-zygote"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 1600, deviceScaleFactor: 2 });
    // Surface in-page failures in the server log so a broken template is diagnosable
    // (instead of silently producing an empty/never-ready page).
    page.on("pageerror", (e) => console.error("[ads-report-pdf] pageerror:", e instanceof Error ? e.message : String(e)));
    page.on("requestfailed", (r) => console.error("[ads-report-pdf] requestfailed:", r.url(), r.failure()?.errorText));
    await page.evaluateOnNewDocument((data: { token: string; user: string }) => {
      try {
        localStorage.setItem("simpulx_token", data.token);
        if (data.user) localStorage.setItem("simpulx_user", data.user);
      } catch { /* ignore */ }
    }, { token: body.token, user: body.user ? JSON.stringify(body.user) : "" });

    // domcontentloaded (NOT networkidle0): the template signals readiness itself via
    // [data-report-ready], so we don't need the network to fully quiesce. Try the
    // internal loopback first; only fall back to the public origin if it errors.
    let navUrl = internalUrl;
    try {
      await page.goto(internalUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (navErr) {
      console.error("[ads-report-pdf] internal nav failed, retrying public:", String(navErr));
      navUrl = publicUrl;
      await page.goto(publicUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    }
    // Wait for the template to load its data + lay recharts out. If it never flips
    // (e.g. an api call hangs), proceed anyway rather than failing the whole export.
    const ready = await page
      .waitForFunction(() => document.querySelector('.print-root')?.getAttribute("data-report-ready") === "1", { timeout: 30000, polling: 250 })
      .then(() => true)
      .catch(() => false);
    if (!ready) console.error("[ads-report-pdf] data-report-ready never flipped; printing current state from", navUrl);
    await page.emulateMediaType("screen");
    // Isolate the report node so the print CSS renders it alone, in light theme.
    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      const el = document.querySelector(".print-root") as HTMLElement | null;
      if (el) { el.style.cssText += ";position:static;margin:0 auto"; document.body.replaceChildren(el); }
      root.style.cssText += ";height:auto;overflow:visible;background:#fff";
      document.body.style.cssText += ";height:auto;overflow:visible;background:#fff;margin:0;padding:16px";
    });
    // Let the layout settle after DOM surgery + any final chart paint.
    await new Promise((r) => setTimeout(r, 600));
    // scale: the template lays out at a fixed 980px (+2x16px body padding) but the
    // A4 printable width at these margins is only ~733 CSS px, and Chromium's
    // page.pdf does NOT auto-fit -- without scaling the right ~28% of every page
    // was simply clipped off. 733 / 1012 ≈ 0.72.
    // Top margin 14mm: sections pushed to a new page by break-inside:avoid lose
    // their CSS margin at the break, so the page margin alone provides the gap.
    const pdf = await page.pdf({ printBackground: true, format: "A4", scale: 0.72, margin: { top: "18mm", bottom: "14mm", left: "8mm", right: "8mm" } });
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ads-report.pdf"', "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[ads-report-pdf] failed:", { chrome: exe, internalUrl, publicUrl, error: e instanceof Error ? e.stack : String(e) });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}
