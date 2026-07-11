import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

// Server-side headless-Chromium PDF of the DEDICATED ads-report template
// (/report/ads), decoupled from the on-theme dashboard. Seeds the session token
// into localStorage, navigates to the print page, waits for the data to load and
// recharts to lay out ([data-report-ready="1"]), then prints. See memory
// ads-report-pdf-template.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = { token?: string; user?: unknown; preset?: string; from?: string; to?: string; campaigns?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { body = {}; }
  if (!body.token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL("/report/ads", req.nextUrl.origin);
  if (body.preset) url.searchParams.set("preset", body.preset);
  if (body.from) url.searchParams.set("from", body.from);
  if (body.to) url.searchParams.set("to", body.to);
  if (body.campaigns) url.searchParams.set("campaigns", body.campaigns);

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 1600, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument((data: { token: string; user: string }) => {
      try {
        localStorage.setItem("simpulx_token", data.token);
        if (data.user) localStorage.setItem("simpulx_user", data.user);
      } catch { /* ignore */ }
    }, { token: body.token, user: body.user ? JSON.stringify(body.user) : "" });

    await page.goto(url.toString(), { waitUntil: "networkidle0", timeout: 45000 });
    // Wait for the template to signal it has data + charts laid out.
    await page.waitForSelector('.print-root[data-report-ready="1"]', { timeout: 20000 }).catch(() => {});
    await page.emulateMediaType("screen");
    await new Promise((r) => setTimeout(r, 500));
    // Isolate the report node so the print CSS renders it alone.
    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      const el = document.querySelector(".print-root") as HTMLElement | null;
      if (el) { el.style.cssText += ";position:static;margin:0 auto"; document.body.replaceChildren(el); }
      root.style.cssText += ";height:auto;overflow:visible;background:#fff";
      document.body.style.cssText += ";height:auto;overflow:visible;background:#fff;margin:0;padding:16px";
    });
    await new Promise((r) => setTimeout(r, 500));
    const pdf = await page.pdf({ printBackground: true, format: "A4", margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" } });
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ads-report.pdf"', "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}
