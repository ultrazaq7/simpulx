#!/usr/bin/env node
/**
 * Merge translations/web_inventory.csv into web/locales/en.json + id.json.
 *
 * - "new" rows: adds en[key] = english, id[key] = indonesian (falls back to english).
 * - Existing keys are never overwritten.
 * - Keys are nested one level: "area.slug" -> { area: { slug } }.
 *
 * Usage: node scripts/i18n_merge_locales.mjs   (from repo root)
 */
import fs from "fs";

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

const en = JSON.parse(fs.readFileSync("web/locales/en.json", "utf8"));
const id = JSON.parse(fs.readFileSync("web/locales/id.json", "utf8"));

function setKey(obj, key, value) {
  const dot = key.indexOf(".");
  if (dot === -1) { if (!(key in obj)) { obj[key] = value; return 1; } return 0; }
  const head = key.slice(0, dot), rest = key.slice(dot + 1);
  if (!(head in obj)) obj[head] = {};
  if (typeof obj[head] !== "object") return 0;
  if (!(rest in obj[head])) { obj[head][rest] = value; return 1; }
  return 0;
}

const rows = parseCsv(fs.readFileSync("translations/web_inventory.csv", "utf8").replace(/^﻿/, ""));
let addedEn = 0, addedId = 0;
for (const r of rows.slice(1)) {
  if (r.length < 6) continue;
  const [, status, , key, english, indonesian] = r;
  if (status !== "new") continue;
  addedEn += setKey(en, key, english);
  addedId += setKey(id, key, indonesian || english);
}

// Backfill: any en key missing from id gets the English value as fallback base.
function backfill(src, dst, path = "") {
  let n = 0;
  for (const k of Object.keys(src)) {
    if (typeof src[k] === "object" && src[k] !== null) {
      if (!(k in dst)) dst[k] = {};
      n += backfill(src[k], dst[k], path ? `${path}.${k}` : k);
    } else if (!(k in dst)) {
      dst[k] = src[k];
      console.log(`backfilled id: ${path ? path + "." : ""}${k} (needs translation)`);
      n++;
    }
  }
  return n;
}
const backfilled = backfill(en, id);

fs.writeFileSync("web/locales/en.json", JSON.stringify(en, null, 2) + "\n");
fs.writeFileSync("web/locales/id.json", JSON.stringify(id, null, 2) + "\n");
console.log(`added ${addedEn} keys to en.json, ${addedId} to id.json, backfilled ${backfilled}`);
