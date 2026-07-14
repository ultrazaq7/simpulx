// Indonesian cities for the catalog location picker: a flat list for type-ahead
// suggestions, plus named metro-area groups for one-click add. City/area names are
// proper nouns (not translated). Groups compose (Jabodetabek ⊃ Jadetabek ⊃ Jakarta).

const JAKARTA = ["Jakarta Pusat", "Jakarta Utara", "Jakarta Barat", "Jakarta Selatan", "Jakarta Timur"];
const JADETABEK = [...JAKARTA, "Depok", "Bekasi", "Tangerang", "Tangerang Selatan"];
const JABODETABEK = [...JADETABEK, "Bogor"];

export interface CityGroup {
  label: string;
  cities: string[];
}

// One-click metro-area presets. The requested Jakarta trio comes first.
export const ID_CITY_GROUPS: CityGroup[] = [
  { label: "Jakarta", cities: JAKARTA },
  { label: "Jadetabek", cities: JADETABEK },
  { label: "Jabodetabek", cities: JABODETABEK },
  { label: "Bandung Raya", cities: ["Bandung", "Cimahi"] },
  { label: "Surabaya Raya", cities: ["Surabaya", "Sidoarjo", "Gresik"] },
  { label: "Semarang Raya", cities: ["Semarang", "Salatiga", "Kendal"] },
  { label: "Medan Raya", cities: ["Medan", "Binjai"] },
  { label: "Makassar Raya", cities: ["Makassar", "Maros", "Gowa"] },
  { label: "Bali", cities: ["Denpasar", "Badung", "Gianyar", "Tabanan"] },
];

// Flat, deduped city list for type-ahead. Jakarta admin cities + Jabodetabek
// satellites + provincial capitals + major second-tier cities. Not exhaustive —
// users can still type any custom city and press Enter.
export const ID_CITIES: string[] = Array.from(
  new Set([
    ...JABODETABEK,
    // Jawa Barat / Banten
    "Bandung", "Cimahi", "Cirebon", "Sukabumi", "Tasikmalaya", "Banjar", "Karawang",
    "Purwakarta", "Subang", "Sumedang", "Garut", "Cianjur", "Kuningan", "Indramayu",
    "Majalengka", "Serang", "Cilegon", "Pandeglang", "Lebak",
    // DKI (already in JAKARTA) + Kepulauan Seribu
    "Kepulauan Seribu",
    // Jawa Tengah / DIY
    "Semarang", "Surakarta", "Solo", "Salatiga", "Magelang", "Pekalongan", "Tegal",
    "Purwokerto", "Kudus", "Kendal", "Yogyakarta", "Sleman", "Bantul",
    // Jawa Timur
    "Surabaya", "Sidoarjo", "Gresik", "Malang", "Batu", "Kediri", "Blitar", "Madiun",
    "Mojokerto", "Pasuruan", "Probolinggo", "Jember", "Banyuwangi", "Lamongan",
    "Bojonegoro", "Tuban", "Madura", "Bangkalan",
    // Sumatra
    "Medan", "Binjai", "Deli Serdang", "Pematangsiantar", "Tebing Tinggi", "Padang",
    "Bukittinggi", "Payakumbuh", "Pekanbaru", "Dumai", "Batam", "Tanjung Pinang",
    "Palembang", "Prabumulih", "Lubuklinggau", "Bandar Lampung", "Metro", "Jambi",
    "Bengkulu", "Pangkalpinang", "Banda Aceh", "Lhokseumawe",
    // Kalimantan
    "Pontianak", "Singkawang", "Palangkaraya", "Banjarmasin", "Banjarbaru",
    "Samarinda", "Balikpapan", "Bontang", "Tarakan",
    // Sulawesi
    "Makassar", "Maros", "Gowa", "Parepare", "Palopo", "Manado", "Bitung", "Tomohon",
    "Gorontalo", "Palu", "Kendari", "Bau-Bau",
    // Bali & Nusa Tenggara
    "Denpasar", "Badung", "Gianyar", "Tabanan", "Mataram", "Kupang",
    // Maluku & Papua
    "Ambon", "Ternate", "Jayapura", "Sorong", "Manokwari",
  ]),
);
