#!/usr/bin/env node
/**
 * Codemod: replace hardcoded user-facing strings in web/ with t("key") calls.
 *
 * Uses the english->key map from translations/web_inventory.csv. Handles:
 *   - JSX text nodes                        -> {t("key")}
 *   - Whitelisted JSX attributes            -> attr={t("key")}
 *   - notify()/alert()/confirm() first arg  -> t("key")
 *   - String literals in ternary/||/&&/?? inside JSX expressions & whitelisted attrs
 *   - Injects `const { t } = useI18n();` into the enclosing component/hook
 *   - Injects `import { useI18n } from "@/lib/i18n";` when needed
 *
 * Deliberately skipped (reported, for manual handling):
 *   - Strings at module scope (no hook available)
 *   - Object-literal props (label:, title:, ...) — may be persisted to the API
 *   - Files without "use client" (server components)
 *
 * Usage: node scripts/i18n_apply_web.mjs [fileOrDir ...]   (from repo root)
 *        default scope: web/app web/components
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("web/node_modules/typescript"));

const ATTR_WHITELIST = new Set([
  "placeholder", "title", "label", "alt", "aria-label", "tooltip",
  "description", "desc", "subtitle", "heading", "header", "emptyText", "empty",
  "confirmLabel", "cancelLabel", "confirmText", "cancelText", "okLabel",
  "successText", "errorText", "helperText", "hint", "message", "text",
  "buttonLabel", "actionLabel", "loadingText", "noOptionsText", "searchPlaceholder",
]);
const CALL_WHITELIST = new Set(["notify", "alert", "confirm", "setError", "setToast", "onSaved", "onError", "setErr", "showToast", "setMsg"]);

const ENTITIES = {
  "&apos;": "'", "&#39;": "'", "&quot;": '"', "&amp;": "&", "&nbsp;": " ",
  "&ldquo;": "“", "&rdquo;": "”", "&lsquo;": "‘", "&rsquo;": "’",
  "&middot;": "·", "&hellip;": "…", "&rarr;": "→", "&times;": "×",
  "&gt;": ">", "&lt;": "<", "&mdash;": "—", "&ndash;": "–",
};
const decodeEntities = (s) => s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
const normText = (s) => decodeEntities(s).replace(/\s+/g, " ").trim();

// ── english -> key map from inventory ──
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (cur !== "" || row.length) { row.push(cur); rows.push(row); row = []; cur = ""; }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const keyMap = new Map();
{
  const rows = parseCsv(fs.readFileSync("translations/web_inventory.csv", "utf8").replace(/^﻿/, ""));
  for (const r of rows.slice(1)) {
    if (r.length >= 5 && r[3] && r[4]) keyMap.set(normText(r[4]), r[3]);
  }
}

// ── file collection ──
const args = process.argv.slice(2);
const roots = args.length ? args : ["web/app", "web/components"];
function* tsxFiles(p) {
  const st = fs.statSync(p);
  if (st.isFile()) { yield p; return; }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const q = path.join(p, e.name);
    if (e.isDirectory()) yield* tsxFiles(q);
    else if (/\.tsx$/.test(e.name)) yield q;
  }
}

const report = [];
let totalReplaced = 0, totalFiles = 0;

function processFile(file) {
  const src = fs.readFileSync(file, "utf8");
  if (!/^\s*(['"])use client\1/m.test(src.slice(0, 300))) {
    report.push(`SKIP-FILE (server component): ${file}`);
    return;
  }
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const edits = [];           // {start, end, text}
  const hookTargets = new Map(); // fnNode -> true
  const skipped = [];

  // Find enclosing component/custom-hook function for a node.
  function enclosingComponent(node) {
    let cur = node.parent;
    let best = null;
    while (cur) {
      if (ts.isFunctionDeclaration(cur) && cur.name && /^([A-Z]|use[A-Z])/.test(cur.name.text)) best = best ?? cur;
      else if (ts.isFunctionDeclaration(cur) && !cur.name &&
               cur.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) best = best ?? cur;
      else if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
        // Direct assignment (const X = () => ...) or wrapped (const X = memo(forwardRef(() => ...)))
        let up = cur.parent;
        while (up && ts.isCallExpression(up)) up = up.parent;
        if (up && ts.isVariableDeclaration(up) && ts.isIdentifier(up.name) &&
            /^([A-Z]|use[A-Z])/.test(up.name.text)) best = best ?? cur;
        // Named function expression wrapped in memo(): memo(function ConversationCard() {...})
        else if (ts.isFunctionExpression(cur) && cur.name && /^[A-Z]/.test(cur.name.text)) best = best ?? cur;
      }
      cur = cur.parent;
    }
    return best;
  }

  function planReplace(node, keyExpr, wrapJsxExpr = false, keepWs = false) {
    const fn = enclosingComponent(node);
    if (!fn) {
      skipped.push(`module-scope: ${JSON.stringify(normText(node.getText(sf))).slice(0, 90)}`);
      return false;
    }
    let start = node.getStart(sf), end = node.getEnd(), text = keyExpr;
    if (wrapJsxExpr) text = `{${keyExpr}}`;
    if (keepWs) {
      const raw = src.slice(node.pos, node.end); // JsxText full range incl. whitespace
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
      start = node.pos; end = node.end;
      text = lead + `{${keyExpr}}` + trail;
    }
    edits.push({ start, end, text });
    hookTargets.set(fn, true);
    return true;
  }

  function tOf(english) {
    const key = keyMap.get(english);
    return key ? `t(${JSON.stringify(key)})` : null;
  }

  function tryLiteral(node, wrapJsxExpr = false) {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return false;
    const eng = normText(node.text);
    const call = tOf(eng);
    if (!call) return false;
    return planReplace(node, call, wrapJsxExpr);
  }

  // Recurse into displayable positions of an expression.
  function handleExpr(expr, conservative) {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) { tryLiteral(expr); return; }
    if (ts.isConditionalExpression(expr)) {
      handleExpr(expr.whenTrue, conservative);
      handleExpr(expr.whenFalse, conservative);
      return;
    }
    if (ts.isBinaryExpression(expr)) {
      const k = expr.operatorToken.kind;
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken ||
          k === ts.SyntaxKind.AmpersandAmpersandToken) {
        handleExpr(expr.right, conservative);
        if (!conservative) handleExpr(expr.left, conservative);
      }
      return;
    }
    if (ts.isParenthesizedExpression(expr)) handleExpr(expr.expression, conservative);
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const eng = normText(node.text);
      if (eng) {
        const call = tOf(eng);
        if (call) planReplace(node, call, false, true);
      }
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (ATTR_WHITELIST.has(name)) {
        if (ts.isStringLiteral(node.initializer)) {
          const eng = normText(node.initializer.text);
          const call = tOf(eng);
          if (call) planReplace(node.initializer, call, true);
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          handleExpr(node.initializer.expression, false);
        }
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const cname = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      if (cname && CALL_WHITELIST.has(cname) && node.arguments[0]) {
        handleExpr(node.arguments[0], false);
      }
      // ["Name","Status",...].map((h) => <th>{h}</th>) — wrap the rendered {h}.
      if (cname === "map" && ts.isPropertyAccessExpression(callee) &&
          ts.isArrayLiteralExpression(callee.expression) &&
          callee.expression.elements.some((e) => ts.isStringLiteral(e) && keyMap.has(normText(e.text)))) {
        const cb = node.arguments[0];
        if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) &&
            cb.parameters[0] && ts.isIdentifier(cb.parameters[0].name)) {
          const param = cb.parameters[0].name.text;
          const wrapRendered = (n) => {
            if (ts.isJsxExpression(n) && n.expression && ts.isIdentifier(n.expression) &&
                n.expression.text === param && !ts.isJsxAttribute(n.parent)) {
              planReplace(n, `{t(${param})}`);
            }
            ts.forEachChild(n, wrapRendered);
          };
          wrapRendered(cb);
        }
      }
    } else if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const pname = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      if (["label", "title", "desc", "description", "placeholder", "tooltip", "hint", "subtitle", "empty", "message"].includes(pname)) {
        const eng = normText(node.initializer.text);
        if (keyMap.has(eng)) skipped.push(`obj-prop ${pname}: ${JSON.stringify(eng).slice(0, 90)}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (!edits.length) {
    if (skipped.length) report.push(`--- ${file} (0 replaced)\n  ` + skipped.join("\n  "));
    return;
  }

  // Hook injection points.
  const needsHookRegex = /const\s*\{\s*t\b[^}]*\}\s*=\s*useI18n\(\)/;
  for (const fn of hookTargets.keys()) {
    const body = fn.body;
    if (!body) continue;
    if (ts.isBlock(body)) {
      const bodyText = body.getText(sf);
      if (needsHookRegex.test(bodyText)) continue;
      // shadowed `t` heuristic — warn, still inject (tsc will catch real conflicts)
      if (/\b(?:const|let|var)\s+t\b/.test(bodyText)) {
        skipped.push(`WARN local 't' in component near offset ${body.getStart(sf)} — check manually`);
      }
      const insertAt = body.getStart(sf) + 1; // after '{'
      edits.push({ start: insertAt, end: insertAt, text: `\n  const { t } = useI18n();` });
    } else {
      // expression-body arrow: () => (<jsx/>)  ->  () => { const { t } = useI18n(); return (<jsx/>); }
      const start = body.getStart(sf), end = body.getEnd();
      edits.push({ start, end: start, text: `{ const { t } = useI18n(); return (` });
      edits.push({ start: end, end, text: `); }` });
    }
  }

  // Import injection.
  if (!/from\s+["']@\/lib\/i18n["']/.test(src)) {
    const m = src.match(/^(['"])use client\1;?\s*\r?\n/m);
    const pos = m ? m.index + m[0].length : 0;
    edits.push({ start: pos, end: pos, text: `import { useI18n } from "@/lib/i18n";\n` });
  } else if (!/\buseI18n\b/.test(src)) {
    // i18n imported but not useI18n (e.g. useT) — extend the import
    const im = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/i18n["']/);
    if (im && !/\buseI18n\b/.test(im[1])) {
      const start = im.index + im[0].indexOf("{") + 1;
      edits.push({ start, end: start, text: ` useI18n,` });
    }
  }

  // Apply edits back-to-front.
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  fs.writeFileSync(file, out);

  const nRepl = edits.filter((e) => e.end > e.start || e.text.startsWith("{t(") || e.text.includes("t(\"")).length;
  totalReplaced += nRepl;
  totalFiles++;
  report.push(`--- ${file} (${nRepl} edits)` + (skipped.length ? `\n  ` + skipped.join("\n  ") : ""));
}

for (const root of roots) for (const f of tsxFiles(root)) processFile(f);

fs.writeFileSync("translations/i18n_apply_report.txt", report.join("\n") + "\n");
console.log(`edited ${totalFiles} files, ~${totalReplaced} edits`);
console.log(`report: translations/i18n_apply_report.txt`);
