/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        // Body / UI — Geist Sans (via geist/font/sans -> --font-geist-sans).
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"],
        // Display — Bricolage Grotesque (page titles, KPI numbers, empty-state headlines).
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"], // display = body face; Bricolage removed
        // Data / utility — Geist Mono (metrics, %, phone, timestamps, IDs). Tabular.
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          dark: "hsl(var(--primary-dark))",
          text: "hsl(var(--primary-text))",
        },
        cold: { DEFAULT: "hsl(var(--cold))", bg: "hsl(var(--cold-bg))" },
        warm: { DEFAULT: "hsl(var(--warm))", bg: "hsl(var(--warm-bg))" },
        hot: { DEFAULT: "hsl(var(--hot))", bg: "hsl(var(--hot-bg))" },
        // AI / automation (Simpuler) — reserved indigo, never a status color.
        ai: {
          DEFAULT: "hsl(var(--ai))",
          foreground: "hsl(var(--ai-foreground))",
          bg: "hsl(var(--ai-bg))",
          text: "hsl(var(--ai-text))",
        },
        // Brand petrol scale (Simpul thread motif, gradients).
        petrol: {
          50: "hsl(var(--petrol-50))",
          100: "hsl(var(--petrol-100))",
          500: "hsl(var(--petrol-500))",
          700: "hsl(var(--petrol-700))",
          900: "hsl(var(--petrol-900))",
        },
        amber: {
          DEFAULT: "hsl(var(--amber))",
          foreground: "hsl(var(--amber-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          border: "hsl(var(--sidebar-border))",
          active: "hsl(var(--sidebar-active))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Tighten the large corners (Tailwind defaults are 12/16px) so cards and
        // tables match the restrained ~8-12px radius of Meta Business settings.
        xl: "calc(var(--radius) + 2px)",
        "2xl": "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(16 24 40 / 0.04)",
        sm: "0 1px 2px 0 rgb(16 24 40 / 0.06), 0 1px 3px 0 rgb(16 24 40 / 0.08)",
        DEFAULT: "0 1px 3px 0 rgb(16 24 40 / 0.10), 0 1px 2px -1px rgb(16 24 40 / 0.08)",
        md: "0 4px 8px -2px rgb(16 24 40 / 0.10), 0 2px 4px -2px rgb(16 24 40 / 0.06)",
        lg: "0 12px 16px -4px rgb(16 24 40 / 0.08), 0 4px 6px -2px rgb(16 24 40 / 0.04)",
        xl: "0 20px 24px -4px rgb(16 24 40 / 0.10), 0 8px 8px -4px rgb(16 24 40 / 0.04)",
        "2xl": "0 24px 48px -12px rgb(16 24 40 / 0.18)",
        "brand-md": "0 6px 16px -4px hsl(174 66% 30% / 0.30)",
        "inner-sm": "inset 0 1px 2px 0 rgb(16 24 40 / 0.06)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, hsl(var(--primary-light)) 0%, hsl(var(--primary)) 55%, hsl(var(--primary-dark)) 100%)",
        "sidebar-gradient": "linear-gradient(180deg, hsl(176 70% 9%) 0%, hsl(178 74% 6%) 100%)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
