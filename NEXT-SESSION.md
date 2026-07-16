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

### Pembagi prorata — SUDAH DIJAWAB user: panjang asli, BUKAN flat 30
Pembagi = **jumlah hari dalam PERIODE BILLING** (bukan "bulan kalender" — beda kalau
renewal-nya anniversary dan periodenya nyebrang 2 bulan; kalau periode = bulan kalender
dua definisi ini identik, jadi framing "panjang periode" aman di dua-duanya).
*Alasan:* invariant "sebulan penuh = persis harga paket" kejaga sendiri tanpa clamp.
Flat 30 melanggar: Januari 31 hari aktif → `31 × (rate/30)` = **103,3% harga paket**,
mesti ditambal `min(hari, 30)`. Konsekuensi yang diterima: rate harian beda tiap periode
(1 hari di Feb lebih mahal dari 1 hari di Jan).

### Periode billing — SUDAH DIJAWAB user (2026-07-17): ANNIVERSARY
Per anniversary, bukan bulan kalender. Pembagi prorata = panjang periode itu (lihat di atas) —
periode anniversary bisa nyebrang 2 bulan, makanya pembagi HARUS panjang periode, bukan
"jumlah hari di bulan".

**Anchor-nya = tanggal SUBSCRIPTION DIAKTIFKAN BERBAYAR — BUKAN tanggal org dibuat, dan
BUKAN `org_subscriptions.created_at`.**
Terverifikasi: org test dibuat **2026-06-17**, subscription-nya **2026-07-06** — **beda 19 hari**.
**`org_subscriptions.created_at` = tanggal orang BUKA HALAMAN**, bukan tanggal bayar:
`subscription.go:14-16` (di dalam **GET** handler) jalanin
`INSERT INTO org_subscriptions (organization_id) VALUES ($1) ON CONFLICT DO NOTHING`
— cuma org_id, sisanya default. Komentarnya sendiri: *"Lazy-ensure a row"*. Gap 19 hari di atas
= tanggal seseorang kebetulan buka halaman subscription.
**Keputusan: simpen anchor EKSPLISIT** (`current_period_start` / `current_period_end`),
di-set pas aktivasi berbayar pertama, di-roll tiap periode. JANGAN diturunkan dari `created_at`
mana pun — `created_at` immutable, sedangkan anchor billing bisa PINDAH (upgrade/downgrade,
cancel lalu reactivate, trial → paid).

### ⚠️ 2 temuan dari klarifikasi user (2026-07-17): starter = paket BERBAYAR termurah, trial itu STATUS terpisah
Claude sempat berasumsi `starter` = free tier — **SALAH, udah diretract.** Enum status di
`0081_credits.sql`: `active | trial | expired`. Konsekuensi yang kebuka:

1. **Org yang belum bayar tercatat `status='active'` di paket berbayar.** Default kolom status =
   `'active'` (bukan `'trial'`), dan row-nya lahir dari page view (lihat di atas). Jadi siapa pun
   yang buka halaman subscription = "active starter" tanpa pernah bayar/trial. **Begitu P6 nagih
   semua `status='active'`, mereka keikut ketagih.** Perlu diputusin: default org baru = `'trial'`?
   Event apa yang flip ke `'active'`?
2. **Kuota kredit reset per BULAN KALENDER padahal langganan ANNIVERSARY.** `subscription.go:20-21`:
   `count(*) ... WHERE sender_type='bot' AND created_at >= date_trunc('month', now())`.
   Org dengan periode 17 Juli–16 Agustus dapat **reset kuota gratis tanggal 1 Agustus**, di tengah
   periodenya. Kuota HARUS reset per periode billing, bukan `date_trunc('month')`.
   Ini konsekuensi langsung dari keputusan anniversary — wajib digarap bareng P6.

**Terverifikasi 2026-07-17 — tabel billing praktis belum ada:** `org_subscriptions` cuma punya
`renewal_date` (date, **nullable**, isinya **NULL**), gak ada `period_start`/`period_end`.
Tabel yang ada cuma `org_subscriptions` + `campaign_credits` — **gak ada** tabel invoice,
payment, atau paket/harga (`finance_packages` itu katalog mobil lama, bukan billing).
P6 = bangun dari nol, bukan nambal.

### Arrears (nagih di belakang) — user memilih ini, dan koheren
User bilang "baru bisa billed pas udah jalan anniversary, baru invoice terbit".
**Catatan penting:** anniversary vs kalender dan bayar-di-muka vs di-belakang itu **2 sumbu
terpisah** — default SaaS justru anniversary + bayar di MUKA. Yang maksa arrears di sini
bukan anniversary, tapi keputusan metering **"ada aktivitas sehari ⇒ sehari penuh kebilling"**:
seat-days aktual baru ketauan SETELAH periode lewat. Jadi arrears itu konsekuensi wajar
dari metering-nya, dan konsisten.
**Konsekuensi yang user udah diberi tau:**
- Uang masuk telat 1 periode (daftar 17 Juli → invoice pertama 17 Agustus).
- Ada risiko kredit (pakai sebulan penuh lalu nunggak). Peredam: kredit AI udah **prepaid**
  (top-up), jadi cuma komponen seat yang kena arrears → risikonya kecil.
- **BELUM DIPUTUSKAN — tanya user di sesi P6:** jatuh tempo invoice berapa hari, dan apa
  yang terjadi kalau lewat (suspend? read-only? bot dimatiin?).
**Ditolak (sengaja):** model Stripe (baseline seat di muka + adjust prorata di invoice
berikutnya). Lebih aman buat cash flow tapi butuh credit/debit note dan ngebuang
kesederhanaan "dihitung dari fakta, bukan tebakan di muka".

### Desain invoicing — disepakati 2026-07-17
- **Start Date Subscription di wizard superadmin** (`superadmin.go:178-190` — bikin
  `organizations` + `org_subscriptions` + user owner dalam 1 transaksi). Itu jadi anchor
  anniversary-nya. **Sekalian set `status` EKSPLISIT di situ** — sekarang gak di-set jadi
  jatuh ke default `'active'`, dan `renewal_date` dibiarin NULL.
- **Pas tanggal anniversary → auto-generate invoice + email.** TAPI **jangan email-only**:
  arrears artinya wajib tau siapa nunggak, jadi tetep butuh tabel invoice sederhana
  (org, period_start, period_end, amount, status, due_date, invoice_no). **Email = turunan
  dari row itu, bukan penggantinya.**
- **Lampirkan CSV rincian seat** (nama, email, tanggal aktif, jumlah hari terbilang, rate,
  subtotal). Ini WAJIB, bukan nice-to-have: model "ada aktivitas sehari ⇒ sehari penuh"
  pasti memicu "kok ditagih 7 seat, si A cuma login sekali" — CSV yang bikin model ini
  bisa dipertahanin.
- **Email 2 fase — USER SETUJU (2026-07-17):**
  **Fase 1** (1-2 siklus): invoice row + CSV digenerate penuh, email ke **admin@simpulx.com**
  (shadow/dry-run) → cocokin nominal sama kenyataan. **Fase 2:** flip penerima ke **client**.
  Kode sama, yang berubah cuma tujuan. Alasan: invoice pertama yang salah nominal ke
  customer = kepercayaan yang susah balik, dan mesin proratanya belum pernah jalan sekali pun.
- **Invoice harus RESMI + pakai logo app** (permintaan user) — kayak invoice SaaS lain.

### Infra email — UDAH ADA, jangan bangun ulang (terverifikasi 2026-07-17)
`libs/go/mailer/mailer.go` (SMTP via `net/smtp`, dipakai gateway buat password reset).
Prod `/opt/simpulx/.env` udah keisi `SMTP_HOST/PORT/USER/PASS/FROM/FROM_NAME`.

**⚠️ BAHAYA buat invoicing — `mailer.go:18-19`:**
```go
if host == "" || strings.TrimSpace(to) == "" { return false, nil }   // sent=false, err=NIL
```
Gagal **diam-diam tanpa error**. Wajar buat password reset (dev lokal), FATAL buat invoice
arrears: env kereset pas deploy → invoice "terbit" di DB, email gak pernah nyampe, gak ada
error, jatuh tempo jalan terus. **Invoicing WAJIB cek `sent == true`, bukan cuma `err != nil`.**
Kalau `sent=false` → jangan tandai invoice "sent", retry + alert.

**⚠️ Mailer BELUM dukung attachment.** Signature: `Send(to, subject, body string, html bool)`
— HTML didukung (bagus buat invoice berlogo), tapi **gak ada attachment**. Permintaan user
(CSV lampiran + logo + invoice resmi) semuanya numpuk di prasyarat yang sama:
- CSV lampiran → butuh `multipart/mixed`
- Logo (email client blokir remote image → idealnya embed CID) → butuh `multipart/related`
- "Resmi kaya app lain" biasanya = **PDF invoice** dilampirin → butuh PDF generator + attachment
**Jadi: perluas mailer ke multipart = prasyarat, sekali bangun ketiganya kebuka.**
Alternatif murah buat fase 1: CSV jadi **link download** (bukan lampiran), logo pakai URL.
Claude condong ke multipart karena tujuannya emang "resmi".

### ⚠️ BELUM DIJAWAB — wajib beres SEBELUM invoice kekirim ke client
0. **Nama badan hukum penerbit invoice = PT apa?** Invoice resmi wajib nyantumin nama PT,
   alamat, (dan NPWP kalau PKP). "PT Carbay" di dokumen ini keliatannya **CUSTOMER** (yang
   dikasih quotation), bukan penerbit. Gak ada di kode — **TANYA USER.**
1. **PPN & faktur pajak.** Penerbitnya **PKP atau non-PKP?** PKP = wajib pungut PPN +
   terbitin faktur pajak; non-PKP = **gak boleh** pungut. Nentuin isi invoice.
   **Gak bisa dicek dari kode — TANYA USER.**
2. **Nomor invoice.** Buat akuntansi biasanya harus berurutan & gak bolong → keputusan skema
   (sequence), bukan tempelan.
3. **Cara bayar.** Invoice ke client harus nyantumin transfer ke mana / VA / dll.
4. **Jatuh tempo berapa hari + konsekuensi telat** (suspend / read-only / bot dimatiin?).
5. **Event apa yang nge-flip `status` jadi `'active'`.**

### DITOLAK sengaja — jangan dibangun (scope creep)
User sempat ngusulin **pilih periode billing 1/3/6/12 bulan** + **on-demand/postpaid/prepaid**
sekaligus. **Jangan.** Alasan:
- **Arrears + 1 tahun = risiko kredit setahun** (customer pakai 12 bulan penuh baru ditagih).
  Periode panjang cuma masuk akal kalau **prepaid**.
- **Prepaid bertabrakan sama "seat-days aktual"** — gak bisa ngitung setahun ke depan dari
  fakta, jadi maksa balik ke baseline+adjustment (model Stripe yang udah ditolak di atas).
  Jadi ini BUKAN "bisa dua-duanya": bulanan→arrears, multi-period→prepaid+adjustment engine.
- 3 model × 4 durasi = **12 kombinasi** buat produk yang belum punya 1 user aktif.
- **Hybrid-nya udah ada:** seat = langganan bulanan, kredit AI = prepaid top-up on-demand.
  Dua sumbu itu udah nutup "bayar tetap" + "bayar sesuai pakai".
**Multi-period prepaid itu keputusan KOMERSIAL, bukan teknis** — selalu dateng bareng minta
diskon. Bangun kalau ada customer nyata yang minta, karena saat itu baru ketauan diskonnya.
**User udah setuju nunda ini** ("oke deh sesuai rekomendasi lu").

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
