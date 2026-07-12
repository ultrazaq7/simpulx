#!/usr/bin/env node
/**
 * Web i18n scanner — AST-extracts user-facing strings from web/app + web/components.
 *
 * Collects:
 *   - JSX text nodes
 *   - Whitelisted JSX attributes (placeholder, title, label, aria-label, ...)
 *   - notify("...") / alert("...") / window.confirm("...") first args
 *   - String literals in conditional expressions inside JSX
 *   - Whitelisted props in object literals (label:, title:, desc:, ...)
 *   - Already-keyed t("...") calls (reported as "keyed")
 *
 * Output: translations/web_inventory.csv (platform,status,area,key,english,indonesian,files)
 * Indonesian pre-filled from translations/translation_master.csv + id_map*.json.
 *
 * Usage: node scripts/i18n_scan_web.mjs   (from repo root)
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("web/node_modules/typescript"));

const WEB_ROOT = path.resolve("web");
const SCAN_DIRS = ["app", "components", "lib"].map((d) => path.join(WEB_ROOT, d));
const OUT = path.resolve("translations/web_inventory.csv");

// ── Attribute / object-prop whitelist ──
const ATTR_WHITELIST = new Set([
  "placeholder", "title", "label", "alt", "aria-label", "ariaLabel", "tooltip",
  "description", "desc", "subtitle", "heading", "header", "emptyText", "empty",
  "confirmLabel", "cancelLabel", "confirmText", "cancelText", "okLabel",
  "successText", "errorText", "helperText", "hint", "message", "text",
  "buttonLabel", "actionLabel", "loadingText", "noOptionsText", "searchPlaceholder",
]);
const OBJ_PROP_WHITELIST = new Set([
  "label", "title", "desc", "description", "placeholder", "tooltip", "hint",
  "subtitle", "empty", "message", "helper", "sub", "caption", "name",
]);
const CALL_WHITELIST = new Set(["notify", "alert", "confirm", "setError", "setToastMsg", "setToast", "onSaved", "onError", "setErr", "showToast", "setMsg"]);

// ── Filters ──
function looksLikeUiString(s) {
  const t = s.trim();
  if (!t) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;               // needs at least 2 letters
  if (/^[a-z0-9_\-./:#%@?&=+*[\]()]+$/.test(t)) return false; // slug/url/id/tw-token
  if (/^https?:\/\//.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false;               // CONSTANT_CASE
  if (/^\{.*\}$/.test(t) || /^<.*>$/.test(t)) return false; // JSON-ish / tag-ish
  if (/^[a-z][a-zA-Z0-9]*(\.[a-z_][a-zA-Z0-9_]*)+$/.test(t)) return false; // dotted key
  if (/^\^|\\b|\\d|\\w/.test(t)) return false;            // regex source
  if (/^#[0-9A-Fa-f]{3,8}$/.test(t) || t === "currentColor") return false; // colors
  if (/^(&[a-z]+;|\s)+$/i.test(s)) return false;          // entity-only fragments
  // tailwind-ish multi-token class string: every token lowercase/util-like AND
  // at least one token carries a utility separator (-, :, [, ], /) — plain
  // lowercase sentences ("to cancel the request.") are real UI copy.
  const tokens = t.split(/\s+/);
  if (tokens.length > 1 && tokens.every((w) => /^[a-z0-9:\-\[\]./%()!]+$/.test(w)) &&
      tokens.some((w) => /[-:\[\]/]/.test(w))) return false;
  // date-fns / dayjs format strings
  if (/^[dMyHhms\s,:./-]+$/.test(t) && /[dMyH]/.test(t)) return false;
  return true;
}

// Array elements are riskier (enum/data values live in arrays too): require a
// space or a capitalized word so slugs, ids and paths stay untouched.
function arrayElementIsUiish(s) {
  const t = s.trim();
  if (!t) return false;
  if (t.includes(" ")) return true;
  return /^[A-Z][a-zA-Z.]*$/.test(t);
}

const ENTITIES = {
  "&apos;": "'", "&#39;": "'", "&quot;": '"', "&amp;": "&", "&nbsp;": " ",
  "&ldquo;": "“", "&rdquo;": "”", "&lsquo;": "‘", "&rsquo;": "’",
  "&middot;": "·", "&hellip;": "…", "&rarr;": "→", "&times;": "×",
  "&gt;": ">", "&lt;": "<", "&mdash;": "—", "&ndash;": "–",
};
function decodeEntities(s) {
  return s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
}

function normText(s) {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

// ── Key generation (matches translation_master.csv style) ──
function keyFor(area, english) {
  const words = english
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5);
  if (!words.length || !words[0]) return null;
  const slug = words
    .map((w, i) => {
      const lw = w.toLowerCase();
      return i === 0 ? lw : lw[0].toUpperCase() + lw.slice(1);
    })
    .join("");
  return `${area}.${slug}`;
}

function areaFor(file) {
  const rel = path.relative(WEB_ROOT, file).replace(/\\/g, "/");
  let m = rel.match(/^app\/\(app\)\/([^/]+)/);
  if (m) return m[1] === "settings" ? "settings" : m[1];
  m = rel.match(/^app\/(login|forgot-password|reset-password|verify-email|delete-account|report|export)\//);
  if (m) return m[1] === "forgot-password" || m[1] === "reset-password" || m[1] === "verify-email" ? "auth" : m[1];
  if (rel.startsWith("components/")) return "components";
  if (rel.startsWith("lib/")) return "components";
  if (rel.startsWith("app/")) return "page";
  return "misc";
}

// ── Walk files ──
function* tsxFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* tsxFiles(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith(".d.ts")) yield p;
  }
}

// ── Extraction ──
const found = new Map(); // english -> { areas:Set, files:Set, contexts:Set }
const keyed = new Map(); // key -> files
let scannedFiles = 0;

function record(english, file, context) {
  const s = normText(english);
  if (!looksLikeUiString(s)) return;
  if (!found.has(s)) found.set(s, { areas: new Set(), files: new Set(), contexts: new Set() });
  const e = found.get(s);
  e.areas.add(areaFor(file));
  e.files.add(path.relative(WEB_ROOT, file).replace(/\\/g, "/"));
  e.contexts.add(context);
}

function scanFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  scannedFiles++;

  function visit(node) {
    // JSX text
    if (ts.isJsxText(node)) {
      const txt = normText(node.text);
      if (txt) record(txt, file, "jsx-text");
    }
    // JSX attributes
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      if (ATTR_WHITELIST.has(name)) {
        if (ts.isStringLiteral(node.initializer)) record(node.initializer.text, file, `attr:${name}`);
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          collectStringsInExpr(node.initializer.expression, `attr:${name}`);
        }
      }
    }
    // Object literal props (module-level meta etc.)
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
      if (name && OBJ_PROP_WHITELIST.has(name)) record(node.initializer.text, file, `prop:${name}`);
    }
    // Calls: notify(...), alert(...), t(...)
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const cname = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      if (cname === "t" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const k = node.arguments[0].text;
        if (!keyed.has(k)) keyed.set(k, new Set());
        keyed.get(k).add(path.relative(WEB_ROOT, file).replace(/\\/g, "/"));
      } else if (cname && CALL_WHITELIST.has(cname) && node.arguments[0]) {
        collectStringsInExpr(node.arguments[0], `call:${cname}`);
      }
    }
    // Conditional strings inside JSX expressions: {x ? "A" : "B"}
    if (ts.isJsxExpression(node) && node.expression) {
      collectStringsInExpr(node.expression, "jsx-expr", true);
    }
    // String elements of array literals (header rows, tuple label/value pairs).
    // Only captured for the inventory; the codemod replaces just the safe
    // display-only subset (arrays immediately .map()-ed).
    if (ts.isArrayLiteralExpression(node)) {
      for (const el of node.elements) {
        if (ts.isStringLiteral(el) && arrayElementIsUiish(el.text)) record(el.text, file, "array-el");
        else if (ts.isArrayLiteralExpression(el) && el.elements[0] &&
                 ts.isStringLiteral(el.elements[0]) && arrayElementIsUiish(el.elements[0].text)) {
          record(el.elements[0].text, file, "tuple-label");
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  // Pull string literals out of simple expressions (ternaries, ||, template heads)
  function collectStringsInExpr(expr, context, conservative = false) {
    if (ts.isStringLiteral(expr)) { record(expr.text, file, context); return; }
    if (ts.isConditionalExpression(expr)) {
      collectStringsInExpr(expr.whenTrue, context, conservative);
      collectStringsInExpr(expr.whenFalse, context, conservative);
      return;
    }
    if (ts.isBinaryExpression(expr) &&
        (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
         expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
         expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
      // only the fallback/right side of || and ?? and && is displayable
      collectStringsInExpr(expr.right, context, conservative);
      if (!conservative) collectStringsInExpr(expr.left, context, conservative);
      return;
    }
    if (ts.isParenthesizedExpression(expr)) collectStringsInExpr(expr.expression, context, conservative);
    // NOTE: deliberately not descending into comparisons (=== "x") or other calls
  }

  visit(sf);
}

// ── Load existing translations for pre-fill ──
function loadIdMaps() {
  const map = new Map();
  for (const f of ["translations/id_map.json", "translations/id_map_extra.json", "translations/id_map_web2.json"]) {
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const [en, id] of Object.entries(j)) map.set(normText(en), id);
  }
  // master CSV english->indonesian (all platforms)
  const csvPath = "translations/translation_master.csv";
  if (fs.existsSync(csvPath)) {
    const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
    for (const r of rows.slice(1)) {
      if (r.length >= 6 && r[4] && r[5] && !map.has(normText(r[4]))) map.set(normText(r[4]), r[5]);
    }
  }
  return map;
}

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

function csvEsc(s) { return `"${String(s).replace(/"/g, '""')}"`; }

// ── Load current locales to know what's already keyed ──
function flatten(obj, prefix = "") {
  const out = {};
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === "object" && obj[k] !== null) Object.assign(out, flatten(obj[k], p));
    else out[p] = String(obj[k]);
  }
  return out;
}

// ── Main ──
for (const dir of SCAN_DIRS) for (const f of tsxFiles(dir)) scanFile(f);

const idMap = loadIdMaps();
const enFlat = flatten(JSON.parse(fs.readFileSync("web/locales/en.json", "utf8")));
const enValueToKey = new Map(Object.entries(enFlat).map(([k, v]) => [normText(v), k]));

const usedKeys = new Set();
const lines = ["platform,status,area,key,english,indonesian,files"];
let nNew = 0, nKeyed = 0, nTranslated = 0;

const sorted = [...found.entries()].sort((a, b) => {
  const aa = [...a[1].areas].sort()[0], bb = [...b[1].areas].sort()[0];
  return aa === bb ? a[0].localeCompare(b[0]) : aa.localeCompare(bb);
});

for (const [english, meta] of sorted) {
  const area = [...meta.areas].sort()[0];
  const existingKey = enValueToKey.get(normText(english));
  let key, status;
  if (existingKey) { key = existingKey; status = "keyed"; nKeyed++; }
  else {
    key = keyFor(area, english);
    if (!key) continue;
    let k = key, n = 2;
    while (usedKeys.has(k)) k = `${key}${n++}`;
    key = k;
    status = "new"; nNew++;
  }
  usedKeys.add(key);
  const indo = idMap.get(normText(english)) ?? "";
  if (indo) nTranslated++;
  lines.push([
    csvEsc("web"), csvEsc(status), csvEsc(`web:${area}`), csvEsc(key),
    csvEsc(english), csvEsc(indo), csvEsc([...meta.files].join(";")),
  ].join(","));
}

fs.writeFileSync(OUT, "﻿" + lines.join("\n") + "\n");
console.log(`scanned ${scannedFiles} files`);
console.log(`strings found: ${found.size} (${nKeyed} already keyed, ${nNew} new)`);
console.log(`indonesian pre-filled: ${nTranslated}/${found.size}`);
console.log(`t() keys in code: ${keyed.size}`);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
