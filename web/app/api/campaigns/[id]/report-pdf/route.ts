import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

// Server-side headless-Chromium PDF of the campaign report. It seeds the session
// token into the page's localStorage, navigates to the REAL report page, and
// renders it through the shared @media print CSS (.print-root / .no-print) so the
// PDF matches the on-screen report exactly. The client falls back to the browser
// print dialog if this route is unavailable (e.g. no Chromium in the deploy).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  token?: string;
  user?: unknown;
  tab?: string;
  preset?: string;
  from?: string;
  to?: string;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }
  if (!body.token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(`/campaign-setup/${id}`, req.nextUrl.origin);
  url.searchParams.set("tab", body.tab || "overview");
  if (body.preset) url.searchParams.set("preset", body.preset);
  if (body.from) url.searchParams.set("from", body.from);
  if (body.to) url.searchParams.set("to", body.to);

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    // Seed the session before the SPA boots so the report renders authenticated.
    await page.evaluateOnNewDocument(
      (data: { token: string; user: string }) => {
        try {
          localStorage.setItem("simpulx_token", data.token);
          if (data.user) localStorage.setItem("simpulx_user", data.user);
        } catch {
          /* ignore */
        }
      },
      { token: body.token, user: body.user ? JSON.stringify(body.user) : "" },
    );
    await page.goto(url.toString(), { waitUntil: "networkidle0", timeout: 45000 });
    await page.waitForSelector(".print-root", { timeout: 15000 }).catch(() => {});
    // Let recharts finish its entrance animation/layout before snapshotting.
    await new Promise((r) => setTimeout(r, 900));
    // Render the report exactly as on screen: force the light theme, isolate the
    // report node as the sole body child (dropping the app shell + in-report
    // controls) and un-clip the scroll containers so it paginates cleanly.
    await page.emulateMediaType("screen");
    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      document.querySelectorAll(".no-print").forEach((n) => n.remove());
      const el = document.querySelector(".print-root") as HTMLElement | null;
      if (el) {
        el.style.cssText +=
          ";position:static;width:100%;margin:0;border:none;box-shadow:none";
        document.body.replaceChildren(el);
      }
      root.style.cssText += ";height:auto;overflow:visible;background:#fff";
      document.body.style.cssText +=
        ";height:auto;overflow:visible;background:#fff;margin:0;padding:16px";
    });
    // Give recharts' ResponsiveContainer time to re-measure after the DOM move.
    await new Promise((r) => setTimeout(r, 700));
    const pdf = await page.pdf({
      printBackground: true,
      format: "A4",
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="campaign-report.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
