# Next session — mulai dari sini

Pre-launch (belum ada user aktif). Budget Rp 2jt/bln. Prod: 1 `t4g.medium`, 13 container
termasuk Postgres. Deploy = push ke main (~2-4 menit; pantau tag image di prod).
DB: `docker exec simpulx-v2-db psql -U simpulx -d simpulx_v2` (nama DB `simpulx_v2`).
Org test: `00000000-0000-0000-0000-0000000000a1`. Campaign katalog:
`5da74098-0518-41a7-8fea-1e08e6a715dd` (500 baris, Jakarta, Mitsubishi).

**User minta semua balasan pakai Bahasa Indonesia santai (gua-lu).** Istilah teknis
biarin Inggris. Commit message tetap Inggris (ikut gaya repo).

## Aturan kerja yang terus terbukti berguna
Verifikasi ke prod SEBELUM bangun DAN SESUDAH (lewat jalur asli, bukan unit test).
Sesi ini: verifikasi nangkep 2 hal yang unit test lolosin — fix pertama yang kekerasan,
dan bug tanda baca yang udah live berbulan-bulan. Bedain "terverifikasi" vs "diasumsikan".

---

## SELESAI + TERVERIFIKASI sesi ini (jangan diulang)

| Commit | Apa | Bukti |
|---|---|---|
| `5a03c92` + `f0dd6d3` | **Fix anchoring** (tugas 1 — BERES) | Dites 2 sisi lewat `/debug/reply` (jalur orkestrasi asli). (a) gak nanya → nol angka, 2 run. (b) nanya varian spesifik → "OTR **di Jakarta** sekitar **Rp 426.850.000** … untuk area **Wamena belum tersedia**, boleh saya cek ke tim?" |
| `5a03c92` | **3 call site legacy dipindah ke campaign catalog** | Follow-up (`orchestrator.py`), AI Smart Reply + summary (`main.py`) tadinya manggil `get_finance_context` global. Sejak `finance_packages` di-TRUNCATE (0 baris, terverifikasi) ketiganya `return None` = **kehilangan grounding harga total**. Sekarang semua lewat `get_catalog_context`. |
| `02dc03d` | **Fix bug tanda baca `_variant_hits`** (ketemu pas verifikasi) | Turn-1 "halo saya minat Xforce, saya di Wamena" — **sebelum**: "fokus katalog kami adalah **Destinator**"; **sesudah**: "tertarik dengan **Xforce** … Exceed CVT atau Ultimate DS?" |

### Detail bug tanda baca (kelas bug yang sama kayak `LIMIT 300` kemarin)
`_variant_hits` nge-pad query lalu substring-test `" {tok} "`. Begitu ada tanda baca
nempel di nama model, match GAGAL: `" xforce "` gak ada di `"...minat Xforce, saya..."`.
Ranking balik ke urutan katalog → D sebelum X → peminat Xforce dijawab Destinator.
Fix kemarin (`LIMIT 3000`) diverifikasi pakai query **tanpa** tanda baca, makanya lolos.
Sekarang kedua sisi di-tokenize sama lalu dibandingin sebagai token.
**Pelajaran: tes pakai kalimat customer asli, yang ada koma/titiknya.**

---

## TEMUAN TERBUKA (belum digarap, urut prioritas)

### 1. `CATATAN AREA` telat 1-2 turn — anchoring turn-1 BELUM tertutup
**Terverifikasi di kode** (`orchestrator.py:87-96`): nurture jalan **SEBELUM** ekstraksi
(sengaja, biar balasan gak ke-block). Akibatnya `lead_fields` selalu telat 1 turn:
- Turn 1: `lead_fields` kosong → `city=None` → **blok `if city_mismatch` gak pernah jalan**
  → `CATATAN AREA` gak ada di prompt sama sekali.
- Turn 2 (customer baru bilang "Wamena"): city masih belum keekstrak → tetap gak ada.
- Turn 3+: baru aktif.

Artinya fix anchoring cuma jalan di **turn 3+**. Di turn 1-2 katalog (yang tiap barisnya
ada "(Jakarta)") tetap diinjeksi dengan header *"Tawarkan Jika Relevan"* tanpa rem apa pun.
**Catatan jujur:** premis handover ("anchoring kebukti 3/4 run di turn 1") **gak bisa gua
verifikasi ulang** — gak ada pesan `426.850.000` tersimpan di `messages` prod (kemungkinan
hasil tes yang gak dipersist). Di 3 run turn-1 sesi ini model **gak** anchoring, tapi itu
bukan karena fix — kebetulan aja. Jadi risikonya masih ada, cuma belum kepegang remnya.
**Opsi:** kasih rem harga yang gak bergantung `city` (mis. selalu larang nyodorin angka
kalau gak ditanya), ATAU pindahin ekstraksi city ke depan nurture khusus turn 1.
**Ini keputusan desain — OBROLIN dulu sama user.**

### 2. Upload katalog: reload page = job yatim (user nanya sesi ini)
**Terverifikasi:** ekstraksi **gak** ke-terminate kalau koneksi putus/reload —
`catalog.go:192` `go s.runCatalogExtract(...)` jalan detached pakai `context.Background()`
+ timeout 10 menit, hasil ke Redis TTL 20 menit. **Tapi** `job_id` cuma hidup di variabel
lokal (`web/lib/api.ts:501`), gak disimpen ke localStorage → reload = gak bisa polling lagi
→ user upload ulang. Peredam: cache content-addressed SHA256 (`catalog.go:168`) → upload
ulang PDF sama = cache hit, 0 token. **Tapi** kalau upload ulang **sebelum** job pertama
kelar, cache belum keisi → ekstraksi jalan 2x → **token kebayar 2x**.
**Gap kedua:** gateway restart (deploy) pas job jalan → goroutine mati, Redis tetap
`pending` → user polling sampai timeout 5 menit → "Extraction timed out".
**Fix murah:** simpen `job_id` di localStorage per campaign + resume polling pas mount.

### 3. `segment` gak kepakai di `get_catalog_context`
Diagnostic IDE (pre-existing, bukan dari perubahan sesi ini). Parameter diterima tapi gak
dipakai — gak ada efek fungsional. Bersihin atau pakai, terserah.

---

## BELUM MULAI — out-of-area → agent manusia (3 bagian, tugas 2)
Urutannya udah disepakati:
1. **Simpen kota di campaign.** Sekarang kota cuma dari **chip UI transient** pas upload —
   `page.tsx:327` bikin `parsed.flatMap(r => locations.map(loc => ({...r, location_name: loc})))`,
   jadi chip OVERRIDE isi file dan nge-fan-out tiap produk per kota (100 × 5 = 500 baris).
   Chip kosong + file gak ada kolom kota ⇒ **semua NULL**. Gak ada yang tersimpan di campaign,
   jadi "luar area" gak bisa diputusin deterministik.
2. **Guard UI**: blok + kasih hint kalau gak ada kota dipilih DAN baris hasil parse gak punya location.
3. **Out-of-area ⇒ handoff** + **note** ("luar area (Wamena) — cek domisili & serviceability").
   *Alasan user (dan ini bener):* KTP luar kota tapi domisili di kota itu = kasus nyata,
   cuma manusia yang bisa mastiin.
   **PENTING: "kumpulin info dulu baru handoff" UDAH JALAN** —
   `if result.ready_for_handoff or fields_done: _ai_handoff(...)`. Yang kurang cuma
   (a) out-of-area belum jadi trigger, (b) note-nya generik, (c) daftar kota belum disimpen.

## LLM CONFIG (tugas 3) — Anthropic-only, FINAL. Jangan tawarin OpenAI lagi.
Alasan nolak OpenAI: tier murah udah ada in-house (Haiku 4.5, $1/$5 = 3× lebih murah),
prompt caching Anthropic load-bearing di struktur cost dan bakal ancur kalau di-split,
dan masalah margin itu di pricing/metering — bukan "Claude mahal".

| Fitur | Sekarang | Target |
|---|---|---|
| nurture, reply (customer-facing) | Sonnet 5 | **tetap** — kualitas = konversi |
| extract, summary, catalog (backend) | Sonnet 5 | **Haiku 4.5** (3×) |
| lead scoring | CatBoost | tetap (gratis) |

Lever kedua: **kecilin injeksi katalog** (14 baris → varian yang ditanya + 3-4).
`cache_write` katalog ~2.600 token = biaya per-credit terbesar di traffic sepi — ini lever
paling gede, lebih gede dari Haiku. Dua-duanya: argo worst-case Rp 320 → ~Rp 200.
**Catatan:** injeksi dibatasi di `finance_rag.py` `rows = rows[:14]` (~baris 210).

## P6 billing per-seat (tugas 4) — BUTUH SESI UTUH
Butuh ledger membership append-only (kolom `users` sekarang state, bukan history;
`inactive_since` ketimpa). Udah diputusin: `rate_per_user numeric(12,2)` +
`currency text NOT NULL DEFAULT 'IDR'` di `org_subscriptions`; prorata harian, ada
aktivitas sehari ⇒ sehari penuh kebilling. Kredit AI prepaid — `llm_usage` BUKAN sumber billing.
**PERTANYAAN BUAT USER (belum dijawab): pembagi bulan pakai panjang asli (28/30/31) atau flat 30?**

## PRICING — udah diputusin
Analisis lengkap: https://claude.ai/code/artifact/915f1932-b731-43ba-89b0-fb496ef9e1d0
- Cost/credit real: **Rp 91-160** sekarang, **Rp 135-240** setelah 2026-08-31 (promo abis, +50%).
- Argo worst-case ≈ **Rp 320/reply**. Reply tipikal: Rp 80-160.
- **Seat itu mesinnya** (margin 63-87%) — tahan Rp 200/150/100k, bonus 200 kredit.
- **Lantai top-up Rp 350** (Enterprise 275 → 350). Booster 400, Pro 375.
- **Ekstraksi katalog GRATIS, final.** Kode udah charge 0 — **jangan bikin charge.**
- **Ekstraksi lead-data GRATIS juga** → model bersih: **"1 kredit = 1 balasan AI ke customer"**.
- ⚠️ **Quotation Section 4 SALAH** — di situ ditulis ekstraksi makan 1 kredit. Ganti ke model
  bersih di atas, atau ledger PT Carbay gak match sama dokumen.
- **Caveat sampel:** angka dari n=49 (1 hari). Arahnya solid tapi **jangan hard-commit harga
  sebelum ~5k+ pesan**. Rekonsiliasi `SUM(cost_usd)` 1 hari UTC penuh vs CSV Anthropic.

## MASIH ANTRE
- **Android release** (Play Console): edge-to-edge ×2 (SDK 35 insets) + picture-in-picture.
- **Device-test** fix mic iOS (`e56ff60`); **browser-test** unread badge P4 (`1a12cf2`).
- **P7 ads**: cron numpang di proses gateway tanpa leader election → sync dobel begitu
  gateway di-scale (dorman di 1 instance). Klaim kuota Google Ads gak bisa dicek dari kode.
- **P3 S3 cutover** (bucket + 152 file udah staged; MinIO masih live).

## JANGAN
- Jangan beli Reserved Instance / RDS / t4g.large sebelum load test 1k.
- Jangan "benerin" harga promo Sonnet-5 di `llm_usage.py` — $2/$10 sampai 2026-08-31 itu BENAR.
- Cache katalog ada di **Redis** (`catalog_extract_cache:*`), bukan DB. Balasan cepat = cache hit.
  Pakai `force:true` atau PDF lain buat maksa ekstraksi beneran.
- Di `StreamingResponse`, kode setelah `yield` terakhir gak dijamin jalan — side effect
  DULUAN, sebelum event terminal.
- `finance_packages` sengaja kosong (332rb baris → 0). **Jangan diisi ulang** — semua jalur
  udah campaign-scoped sekarang.

## Cara drive jalur asli (kepake terus, hemat waktu)
`/debug/reply` manggil `orchestrator.handle_inbound` = jalur orkestrasi asli.
Container **gak ada curl** — copy script python via `docker cp` (container ke-recreate tiap
deploy, jadi copy ulang). Yang penting:
- **Simpen pesan inbound ke `messages` DULU** + kirim `message_id`, kalau nggak classifier
  dapat `cr=None` → `llm skipped` reason `no_signal` → ekstraksi gak jalan.
- `psql -c` bungkus multi-statement jadi 1 transaksi: 1 statement gagal = **semua rollback**
  (termasuk UPDATE yang keliatan sukses). Jalanin terpisah.
- Ada unique index `idx_conv_active_contact_campaign` (contact_id, campaign_id) buat
  `status <> 'closed'` → 1 contact = 1 conversation aktif per campaign. Bikin contact baru per tes.
- Kolom contact itu `full_name`, bukan `name`.
