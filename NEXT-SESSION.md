# Next session — mulai dari sini

> ## ⚠️ REPO INI PUBLIK
> Terverifikasi 2026-07-17: `api.github.com/repos/ultrazaq7/simpulx` balikin **200 tanpa auth**.
> File ini ke-commit ke sana, jadi **apa pun yang ditulis di sini kepublikasi ke internet**,
> dan git history bikin itu **permanen** walau file-nya dihapus belakangan.
> **JANGAN tulis di sini:** kredensial, isi `.env`, kunci, password, atau data legal/finansial.
> Rahasia taro di `/opt/simpulx/.env` (pola yang udah dipakai: `ADS_TOKEN_ENC_KEY`, `SMTP_PASS`),
> dan di file ini cukup rujuk namanya doang.

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

## LANJUTAN SESI 2026-07-17 — SELESAI + TERVERIFIKASI

| Commit | Apa | Bukti (jalur asli `/debug/reply`) |
|---|---|---|
| `3c8356e` | **AI gak boleh nembak model + gak nyodorin katalog kalau gak ditanya** | `pajero1` — **sebelum**: *"katalog yang tersedia di sistem kami **adalah** Mitsubishi Destinator"* (BOHONG — katalog juga jual Pajero/Xpander/Xforce); **sesudah**: *"Pajero Sport kami ada varian GLX, Exceed, Dakar, Dakar Ultimate"* + nol angka. `Wamena` → *"dicatat domisili di Wamena ya. Cash atau kredit?"* — **nol angka** (sebelumnya nyodorin 3 harga sekaligus). |
| `9c926a4` | **Keyword ads gak lagi dibaca sebagai ucapan customer** | `promo-dp-ringan-pajero1` (genuine=false, ngandung "promo"+"dp") → **nol angka**. Customer asli `Dakar Ultimate 4x2 harganya berapa` (genuine=true) → OTR Rp 723.450.000 + cicilan 12-60 bln. **Dua sisi lulus.** |

### Akar masalah "AI nembak model" (temuan besar)
`_catalog_from_table` nge-collapse baris per **(item, variant, LOCATION)** — kotanya ikut jadi
kunci. Jadi 20 varian × 5 kota = **100 grup**, lalu `rows[:14]` cuma muat **Destinator doang**
(3 varian × 5 kota = 15, kepotong di 14). Urutan alfabetis bikin Pajero/Xpander/Xforce **gak
pernah nyampe prompt sama sekali**. Terus `CATATAN VARIAN` negesin daftar itu *"SEMUA varian
yang tersedia"* → model gak halusinasi, dia **percaya prompt**.

**Desain sekarang (sekalian ngerjain SEBAGIAN tugas 3):**
- **Nama varian → SELALU lengkap**, dedupe lintas kota/tenor, gak pernah dipotong (~20 baris).
  Model selalu bisa jawab "kalian jual apa aja?" dan gak pernah perlu nebak.
- **Harga → cuma kalau customer BENERAN nanya** (`_asks_price` atas kata-katanya sendiri), dan
  cuma varian relevan. Kalau gak nanya, harga **gak diinjeksi sama sekali** → hemat ~2.600
  token/balasan di kasus paling umum.

### Keyword ads — klarifikasi user (Claude sempat salah 2×)
`campaigns.keywords` (mis. `{Xforce1}`, `{pajero1}`) itu **param tracking iklan** yang dateng
sebagai pre-fill wa.me — **BUKAN ketikan lead**. Claude sempat ngira itu artifact tes user.
Formatnya bebas dan **gak selalu ngandung nama model**.
- `messaging/main.go` udah nandain CTWA referral opener `genuine=false`, **tapi body yang
  ke-rute lewat KEYWORD dateng tanpa referral** → dulu kehitung `genuine=true`.
- ai-agent **gak pernah dikasih tau** genuine-nya.
- Sekarang: `genuine := e.Referral == "" && !keywordRouted && type != "unsupported"`, dan
  `maybe_nurture` baca `messages.genuine` (COALESCE default true) → cuma kata-kata lead
  sendiri yang boleh nge-rank varian / buka gate harga.
- **Efek samping disengaja & disetujui user:** lead classifier sekarang juga ngindahin pesan
  keyword-routed — konsisten sama alasan asli kolom itu ("avoid biasing every ad lead").

---

## LANJUTAN SESI 2026-07-17 (bagian 2) — SELESAI + TERVERIFIKASI

Dipicu 2 screenshot WA user (bot beneran ngaco di prod):

| Commit | Apa | Bukti (jalur asli `/debug/reply`) |
|---|---|---|
| `2bcdf09` | **Opener iklan disapa, bukan dipitching** + **covered_cities** (service area campaign) | `Xforce1` (opener murni) → *"Halo, selamat datang… ada yang bisa saya bantu?"* nol varian. Sebelumnya nyodorin 6 varian ke orang yang belum ngetik apa-apa. |
| `07458a5` | **Guard UI: gak bisa upload katalog sebelum pilih kota** + Replace nyinkron `covered_cities` + **fix regresi** | Regresi dari 2bcdf09: `genuine=false` juga nge-null-in query → gate harga ketutup → `Xforce1 Ultimate DS harganya berapa` malah *"cek ke tim"*. Fix: buang keyword, sisanya kata lead → gate kebuka. |
| `0d4b9bc` | **Gate harga persisten** (bukan cuma pesan saat itu) | Lead nanya *"berapa termurah"*, lalu jawab *"yang ultimate CVT"* (tanpa kata harga) → tetep dapet OTR. Sebelumnya: 4 turn *"cek ke tim"* buat model yang ADA di katalog. |
| `37091ea` | **Bot akui out-of-area, bukan ngeles** | Lead Jombang (campaign Jakarta-only) + varian → *"OTR di Jakarta Pusat Rp 342.800.000 … untuk Jombang belum tersedia karena di luar area layanan reguler kami, bisa saya bantu cek ke tim."* Sebelumnya: nol angka, nol pengakuan area. |

## SESI 2026-07-17 (bagian 5) — batch bug dari screenshot user — SELESAI + TERVERIFIKASI

Semua dipicu screenshot user (prod), semua diverifikasi lewat jalur asli.

| Commit | Apa | Bukti |
|---|---|---|
| `fcb3c23` | **Cold gak boleh naik ke `qualified`.** Lead cold (OOA/>3bln/info kurang) tampil stage "Memenuhi Syarat" di UI. Sekarang stage AI di-cap ke `contacted` kalau interest cold; warm/hot tetap boleh qualified. | CLS A (Jombang + "mau test drive") → `interest=cold`, `stage=contacted`, reason "Luar area layanan (Jombang)". |
| `fcb3c23` | **Report agen: buang akun ke-soft-delete + 1 baris per akun.** Query cuma filter `role`, gak `is_deleted` → "Agent Dua" dobel (satu akun `+deleted-`) + "tes" muncul. Juga `GROUP BY (agent, branch)` mecah 1 agen jadi banyak baris (angka kepecah). | Sekarang 3 baris unik: Agent Satu (19), Agent Tiga (1), Agent Dua (0). Dobel & "tes" hilang. Team headcount juga di-filter `is_deleted`. |
| `081db61` | **Source filter Campaign Performance = semua sumber lead.** Dropdown cuma ad platform (Meta) padahal tabel nampilin "Langsung"/Direct → gak bisa difilter. Sekarang dropdown pakai classified key yang sama dgn tabel; backend filter leads/funnel/latest-leads pakai `sourceClassifyExpr`, dan **derive platform** buat spend (direct/website → spend 0 via sentinel). | Endpoint asli + JWT: tanpa filter → 20, `source=direct` → 14, `source=meta_ads` → 6. Tabel sumber tetap full (cross-filter control). |
| `c703102` | **Em dash gak boleh sampai customer.** Balasan live ada "Destinator — ada yang menarik". Prompt nurture/followup gak punya rule-nya, dan rule prompt doang gak cukup (model suka ngeyel). 2 lapis: `NO_EMDASH_RULE` + sanitizer deterministik `_normalize_dashes` (range angka → hyphen, sisanya → koma) di nurture/followup/reply+summary stream. | 0 em dash di semua balasan tes. "12—60" → "12-60" (bukan koma). |
| `c703102` | **Stop ngeladenin spammer/troll** (tiap balasan = 1 kredit customer). Rules high-precision lolos: "kntl" ≠ "kontol", gibberish bukan blast/URL. (1) perluas rules kata kasar (kntl/anjg/jnck/gblk...), sengaja **gak** masukin slang ringan spt "anjir" biar lead asli aman. (2) `stand_down` di LLM nurture buat yg rules gak bisa (gibberish/troll/non-answer/scam/prompt-injection). Guardrail KETAT: nol minat beli di SELURUH percakapan DAN lead tetap begitu ≥2× setelah bot ngajak; pesan aneh pertama ("tes",".") gak pernah kena. (3) stand_down → 1 pesan penutup sopan lalu park lost/spam + bot mati. Junk (rules & model) sekarang juga **`unread_count=0`** biar spam gak nyampah badge di inbox agen. | Troll: `tes1`→disapa, `gkgkgk`→dibantu, `bau`→**closing + stand down + spam + unread 0**, `mls gjls`→**0 balasan**. Abusive `kntl` → **0 balasan sama sekali**, langsung spam+down+read. Lead asli "harga pajero...jakarta pusat" → **tidak** kena, dijawab OTR Rp 670.300.000. |
| `b49f920` | **1 burst = 1 balasan (anti dobel).** Dulu: balas instan ke pesan-1, lalu **defer balasan KEDUA** buat sisa burst → burst SELALU 2 kredit (kelihatan live: 2 pesan bot dalam 1 menit). Sekarang `maybe_nurture` **debounce** (`NURTURE_SETTLE_SEC=10`), burst → 1 task → 1 balasan dgn seluruh burst di konteks. Burst guard `recent_bot` diganti guard presisi **`has_new`** (cuma balas kalau ada pesan customer BARU sejak balasan terakhir) → redelivery jadi gak nambah biaya. Lock-miss sekarang keluar, gak nge-antri task kedua. | 3 pesan beruntun → **1 balasan**, dan balasannya pakai model dari pesan-2 + kota dari pesan-3: "Pajero Sport **Dakar** 4x2 AT di **Jakarta Pusat**, OTR Rp 670.300.000". 1 pesan → 1 balasan. |
| `ed1efe5` | **Stage "Contacted" → "Connected" / "Terhubung".** Lead itu yang menghubungi KITA lalu bales, jadi "Contacted" kebalik. Display name doang: `system_key='contacted'` tetap, jadi nol perubahan kode. Migration `0098` (rename baris lama, guarded; + `seed_org_pipeline` buat org baru) + i18n en "Connected" / id "Terhubung" (blok `stages` DAN label kolom dashboard). | (lihat verifikasi di bawah) |

### Catatan penting dari batch ini
- **`_PENDING_NURTURE` dilepas saat WINDOW habis, bukan saat balasan mendarat** — biar pesan yang masuk pas balasan lagi digenerate memulai burst baru (dapat jawaban sendiri), bukan didrop.
- **Anthropic 529 (overloaded) = balasan hilang tanpa retry.** Kejadian pas verifikasi: lead asli gak dibales, log `nurture failed ... 529`. Ini **pre-existing**, bukan dari perubahan sesi ini, tapi nyata: transient overload = lead gak dijawab, gak ada retry. **Kandidat kerjaan berikutnya.**
- Rules kata kasar **sengaja konservatif**: "anjir" dibuang (terlalu umum, "anjir keren nih mobilnya" itu lead asli). Diverifikasi nol false-positive.
- `sourceClassifyExpr` cuma nandain `meta_ads` dari attribution; tabel sumber sengaja **abaikan** source filter (dia cross-filter control, footer tetap penuh).

## SESI 2026-07-17 (bagian 4) — Smart Reply gate + CLASSIFIER STRICT — SELESAI + TERVERIFIKASI

| Commit | Apa | Bukti (jalur asli prod) |
|---|---|---|
| `a398d8e` | **Smart Reply pakai `recent_text`** (tugas 3a beres). Draft `/reply/stream` dulu cuma gate di pesan terakhir → dodge kayak `0d4b9bc`. | Histori sama persis, last inbound "oh yang 4x2 aja deh kak": **before** *"boleh info nama, cash/kredit?"* (nol harga) → **after** *"cicilan Rp 50.311.000 ... Rp 13.972.000, TDP Rp 109.9 jutaan"*. |
| `907c6ac` | **Classifier temperature STRICT** (hot/warm/cold). Dulu over-promote via volume/klik: `reply_count>=5` atau `ad_clicks>=3` → hot; `>=2`/`>=1` → warm. Chatter tanpa intent / klik iklan doang bisa hot/warm. | 6 tes prod (pre-seed `lead_fields`): OOA+testdrive→**cold**, lengkap+"masih survei"→**cold**, lengkap+"bulan depan"+harga→**warm**, harga+info kurang→**cold**, booking/visit/closing→**hot**, no-reply opener→**NULL/New Leads**. |

**Keputusan user (classifier) — kekunci:**
- **Intent-only, buang total shortcut volume + `ad_clicks`** (genuine-only). `classify()` gak lagi terima `ad_clicks`.
- **HOT** = Booking/Order, Test Drive, Visit/Showroom, Strong/Closing (komit/visit/closing). Murni intent, gak butuh info lengkap.
- **WARM** = ada intent lain (Price/Promo/Specs/Docs/Stock/Trade-in/Model) DAN `fields_done` lengkap DAN in-area DAN horizon jelas ≤3 bulan. Documents/Process = warm (bukan hot).
- **COLD** = default ambigu. Filter bisnis (di `classify_and_update`, butuh `lead_fields`+`covered_cities`): **(1) out-of-area di-filter PERTAMA** (gak pernah hot/warm), (2) horizon >3 bulan / non-komit ("masih survei, gatau kapan") → cold, (3) warm wajib lengkap+soon.
- **No-reply setelah iklan → stage TETEP New Leads** (udah kejaga: `classify_and_update` early-return kalau gak ada pesan genuine).
- `buy_within_3mo(str)` helper baru di `classifier.py`: True(≤3bln)/False(>3bln atau vague)/None(unknown). FAR dicek sebelum SOON.
- **Stage = axis TERPISAH dari temperature** (sengaja tak diubah): `STRONG_INTENT` masih nyetir stage=qualified + LLM gate. Jadi bisa stage=qualified tapi interest=cold. Kalau user mau stage ikut temperature, itu ask terpisah.
- **CatBoost `lead_score` (features.py/lead_score.py) TETAP pakai `ad_clicks`** sebagai fitur — itu axis buy-potential yang beda, jangan disamain sama interest classifier.

## SESI 2026-07-17 (bagian 3) — TUGAS 1 handoff OOA stall — SELESAI + TERVERIFIKASI

Keputusan user (diobrolin dulu): **C = A + B**, plus refinement "OOA handoff instan, bawa
produk kalau udah kesebut". Root cause & fix:

**Stall (reproduce di prod, before):** lead Jombang + "masih survei sih kak, gatau kapan belinya"
→ `lead_fields={city:Jombang, brand:Mitsubishi, model:Pajero Sport}` tanpa `purchase_timeframe`
→ `fields_done` gak pernah true, `ready_for_handoff` juga gak (cuma nyala kalau lead minta
manusia/komit) → `is_bot_active=t`, `handoff_at=NULL` selamanya. Bot tiap turn **janji** "tim akan
cek serviceability" tapi handoff-nya gak pernah jalan (ngutang janji).

| Commit | Apa | Bukti (jalur asli `/debug/reply`) |
|---|---|---|
| `eb84ca8` | **A: ekstraksi timeframe** — jawaban non-komit ("masih survei/belum tahu/gatau kapan") jadi nilai sah, bukan null (`llm.py _extra_fields_instruction`). **B: OOA handoff instan** — begitu `_out_of_area_city` balikin kota, handoff SAAT ITU (bypass `fields_done`), gak nunggu qualifier lain. Note bawa produk (`- minat {model/brand}`). Plus nudge tanya domisili lebih awal (cuma kalau campaign punya `covered_cities` & city belum diketahui) TANPA ngedodge pertanyaan lead. | **Tes1 OOA:** Jombang+"gatau kapan" → `is_bot_active=f`, handoff jalan, reason *"luar area (Jombang) - minat Pajero Sport"*. **Tes2 in-area vague:** Jakarta Selatan + "belum tau kapan, masih lihat2" → timeframe keekstrak → `fields_done` → handoff (lag 1 turn, arsitektural krn nurture jalan sebelum ekstraksi). **Tes3 in-area no-timeframe:** cuma nanya harga → timeframe tetep null, **gak** handoff, harga **dijawab** (OTR Rp 670.300.000) → nudge domisili gak ngedodge & fix A gak over-fire. |

**Catatan lag 1 turn (bukan bug, tapi inget):** handoff (OOA maupun fields_done) mengevaluasi
`row["metadata"]` yang di-load SEBELUM ekstraksi turn ini (nurture jalan duluan, sengaja biar
balasan gak ke-block, `orchestrator.py` step 2 vs 3). Jadi OOA ke-handoff di turn SETELAH city
keekstrak, bukan turn city pertama disebut. Tetap terminasi (vs infinite loop), cukup buat kasus ini.

### ~~UNTUK DIOBROLIN — promo dari kreatif iklan~~ — TUGAS 2 SELESAI + TERVERIFIKASI (`13bbe10`)
Keputusan user: **D + sedikit A**. Root cause dulu (verified prod): bot **defer** "perlu dicek
ke tim" TAPI `is_bot_active` tetep true = janji tanpa handoff (kelas bug sama kayak OOA), dan
gak manfaatin teks iklan yang udah disimpen. Fix:
- `_asks_promo` baru (`finance_rag`): detektor promo SEMPIT, sengaja gak nangkep finance normal
  ("bunga berapa", "DP-nya berapa") biar gak nge-handoff pertanyaan harga yang bisa dijawab.
- Pas promo kesinggung: prompt nyuruh bot **akui** topik promo (ngutip `referral_headline/body`
  kalau ada), **gak boleh** konfirmasi/nyangkal/ngarang angka promo, defer ke tim, lalu
  **handoff deterministik** (note `tanya promo iklan - perlu konfirmasi tim`, komposabel sama OOA).
- Bukti: (1) promo+teks iklan → *"iklan Promo Pajero Sport Akhir Tahun memang tertulis DP mulai
  10 juta dan bunga 0 persen, tapi untuk kepastian... konfirmasi ke tim"* + handoff. (2) promo
  tanpa teks → akui generik + defer + handoff. (3) regresi "DP berapa? bunga cicilannya berapa?"
  → **gak** kena promo, dijawab OTR/TDP/cicilan katalog normal.

Catatan lanjut kalau promo jadi rutin: **B** (field promo terstruktur di campaign + UI) biar bot
bisa konfirm dari data beneran. Belum dibangun (keputusan komersial, tunggu ada kebutuhan).

<details><summary>Konteks opsi lama (arsip)</summary>
Lead yang dateng dari iklan sering nanya nyocokin promo di GAMBAR iklannya:
*"promonya bener? DP 10jt beneran? bunga 0% bener?"*. Sekarang bot **gak bisa jawab
akurat** dan risikonya gede: bisa ngarang syarat, nyangkal promo yang beneran ada, atau
ngiyain promo yang gak bisa dia verifikasi (kelas bug yang sama kayak anchoring harga).

**Terverifikasi 2026-07-17:**
- Kreatif iklan (headline, body, **image_url**, media_type) DISIMPAN di
  `conversation_attributions` (`store.go:497`, lewat `recordAttribution`).
- ai-agent cuma baca **COUNT** attribution buat lead scoring (`orchestrator.py:726`),
  **gak pernah baca isi kreatifnya** ke prompt nurture. Jadi bot buta soal promo yang diiklanin.
- Promo (DP/bunga 0%) biasanya **kebakar di GAMBAR**, bukan teks, jadi `referral_headline`/
  `referral_body` pun sering kosong dari angka promonya.
- Katalog punya OTR/tenor/cicilan asli, tapi **belum tentu** punya syarat promo (DP promo,
  bunga 0%, periode) sebagai data terstruktur.

**Opsi buat diobrolin (jangan langsung bangun):**
- (A) Suapin teks kreatif (`referral_headline`/`body`) ke prompt biar bot bisa MENGAKUI apa
  yang diiklanin, TAPI dilarang keras konfirm/nyangkal angka spesifik yang gak bisa
  diverifikasi. Murah, tapi kalau promonya di gambar doang teksnya kosong.
- (B) Tambah field promo terstruktur di campaign/katalog (DP promo, bunga, periode, syarat)
  biar bot bisa konfirm dari data beneran. Paling akurat, tapi butuh input manual + UI.
- (C) OCR/vision baca gambar iklan buat ekstrak teks promo. Paling berat.
- (D) Default paling aman: begitu lead nyinggung promo, bot AKUI + *"biar akurat saya
  konfirmasi dulu ke tim"* + handoff. Gak pernah ngarang/nyangkal. Bisa jalan tanpa data promo.
Rekomendasi awal Claude: **(D) sekarang** (aman, cepat), **(B) nanti** kalau promo jadi
fitur rutin. Tapi ini keputusan user.
</details>

### Yang belum kelar dari tugas 2
- ~~**Handoff out-of-area bisa NGE-STALL.**~~ — **SELESAI + TERVERIFIKASI di `eb84ca8`** (lihat
  di bawah). Keputusan user: A + B (ekstraksi timeframe difix DAN out-of-area handoff tanpa
  nunggu semua qualifier), OOA handoff instan bawa produk kalau ada.
- ~~**Smart Reply (`main.py`) belum pakai `recent_text`**~~ — **SELESAI + TERVERIFIKASI `a398d8e`**
  (lihat bagian 4 di atas).
- **Konfirmasi Meta CTWA opener beneran `genuine=false`.** Diverifikasi buat keyword-routed
  (`main.go` `!keywordRouted`), tapi buat referral opener asli dari Meta belum dites end-to-end
  (butuh webhook beneran, bukan `/debug/reply`).

---

## TEMUAN TERBUKA (belum digarap, urut prioritas)

### ~~1. `CATATAN AREA` telat 1-2 turn~~ — **SELESAI di `3c8356e`**
Sempat kebukti live lewat screenshot WA user: lead ngetik `Wamena` doang (gak nanya harga)
dan bot nyodorin **3 harga sekaligus**. Sebabnya nurture jalan **SEBELUM** ekstraksi
(`orchestrator.py:87-96`, sengaja biar balasan gak ke-block), jadi `lead_fields` telat 1 turn
→ turn 1-2 `city=None` → blok `if city_mismatch` gak pernah jalan → `CATATAN AREA` gak ada di
prompt → gak ada rem sama sekali.
**Ketutup** karena gate harga yang baru (`_asks_price`) **gak gantung ke `city` sama sekali**:
gak ditanya = harga gak diinjeksi, turn berapa pun. Terverifikasi: `Wamena` → *"dicatat
domisili di Wamena ya. Cash atau kredit?"* — nol angka.
*Catatan: `lead_fields` telat 1 turn itu masih fakta, cuma sekarang gak berbahaya lagi buat
anchoring. Kalau nanti ada fitur lain yang gantung ke `lead_fields` di turn 1, inget ini.*

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

Lever kedua: **kecilin injeksi katalog** — **SEBAGIAN UDAH JALAN di `3c8356e`.**
Sekarang: kalau customer **gak nanya harga**, yang diinjeksi cuma **daftar nama varian**
(~20 baris, tanpa harga/tenor) → hemat ~2.600 token di kasus paling umum. Blok harga
(`rows[:14]`) cuma muncul kalau `_asks_price(query)` true.
**Sisa kerjaan:** pas customer NANYA harga, blok harganya masih 14 baris — kecilin ke varian
yang ditanya + 3-4. Ingat `rows[:14]` itu ngitung **(varian × kota)**, bukan varian doang
(lihat akar masalah di atas) — jadi kalau mau dikecilin, dedupe kota dulu atau angkanya
nyesatin.
Sisa lever: **Haiku 4.5** buat extract/summary/catalog. Dua-duanya: argo worst-case
Rp 320 → ~Rp 200.

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
0. **Nama penerbit invoice** — pakai **"Simpulx"** dulu. Detail badan hukum tanya user
   lagi pas invoice beneran mau dikirim ke client (fase 2), dan **taro di prod `.env`,
   JANGAN di repo** (lihat peringatan repo publik di atas).
1. **Pajak / PPN** — **TANYA USER** sebelum invoice kekirim ke client. Nentuin invoice
   pakai PPN atau nggak. **Jangan hardcode salah satu** — bikin PPN sebagai field yang
   bisa dinyalain, karena status ini bisa berubah seiring omzet. Jangan nebak: salah
   pungut pajak itu urusannya sama DJP, bukan bug yang bisa di-revert.
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
