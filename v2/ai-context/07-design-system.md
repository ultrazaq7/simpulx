# 07 — Design System

The single source of truth is the MUI theme in `web/lib/theme.ts`. This doc documents
those tokens and the conventions built on top. **Do not hardcode values that exist as
tokens** — read from the theme.

## Brand

Ported from v1 brand (`app_style.dart`). Green primary, amber accent, near-black ink.

## Color tokens

| Token | Value | Use |
|---|---|---|
| primary.main | `#2D8B73` | Primary actions, links, active state |
| primary.light | `#3AA88D` | Gradients, hover |
| primary.dark | `#236F5D` | Pressed |
| secondary.main | `#F5A623` | Accent (the "x" in Simpul**x**), highlights |
| success.main | `#2D8B73` | Active/connected, won |
| warning.main | `#F59E0B` | Pending, follow-up |
| error.main | `#EF4444` | Destructive, lost |
| info.main | `#0288D1` | Informational |
| background.default | `#F4F8F6` | App canvas |
| background.paper | `#FFFFFF` | Cards, tables, dialogs |
| text.primary | `#0F172A` | Body |
| text.secondary | `#667085` | Labels, meta |
| text.disabled | `#9CA3AF` | Placeholders, empty |
| divider | `rgba(0,0,0,0.08)` | Borders, separators |
| action.selected | `rgba(45,139,115,0.08)` | Selected nav/row |
| Sidebar bg | `#0d1b16` | Dark app rail (Shell) |

**Semantic chip colors** used across pages: role `owner`#7C3AED, `admin`#2563EB,
`manager`#0891B2, `agent`#64748B; status active `#16A34A`; attribution ad `#2563EB`,
keyword `#0D9488`. Status pills won `#15803D`/`#DCFCE7`.

## Typography

- Family: **Inter** (system fallback). Antialiased.
- Scale: h4 24/700, h5 20/700, h6 16/600, subtitle1 15/600, subtitle2 13/600 UPPERCASE
  +0.05em (section labels), body1 14/1.6, body2 13/1.5, caption 11.
- Buttons: `textTransform: none`, weight 600. (Sentence case everywhere — see BR-24, no
  em dashes.)

## Shape & elevation

- **Border radius: 8px** everywhere (`shape.borderRadius: 8`). Cards, inputs, chips,
  dialogs, buttons all 8.
- Soft shadow ramp (theme `shadows`); contained buttons are flat by default and lift to
  `0 4px 12px rgba(45,139,115,0.3)` on hover.
- Custom 6px scrollbars (`#CBD5E1`).

## Component conventions (from theme overrides)

- **Button:** flat contained, 1.5px outlined with neutral border, sentence case.
- **Card:** `variant="outlined"`, no shadow, 8px.
- **Chip:** weight 600, small 20px / default 24px, 8px radius.
- **TextField/Select:** small + outlined by default, 8px.
- **Table:** uppercase 11px header labels, compact 6–8px cell padding, hairline row
  borders `rgba(0,0,0,0.06)`.
- **Tooltip:** arrow, 6px radius. **Dialog:** 8px paper.

## Layout patterns (settings)

Shared helpers in `web/app/settings/_shared.tsx`:
- `useToast()` → `{ notify, ToastHost }` — the standard Snackbar+Alert.
- `PageBody({ maxWidth })` — standard scroll container + padding.
- `PageHeader({ left, right })` — title-less header row; primary action on the right.
- `SectionLabel`, `ROLES`, `ROLE_COLOR`, `ROLE_PERMS`, `initials`.

## Enterprise-clean rules (product decision)

- **No per-page title + description header blocks.** Pages start directly with content
  (toolbar/table). The page name lives in the nav + browser tab.
- Tables for any list that will grow (People, Campaigns) — paginated (10/25/50), with a
  search field top-left and the primary action top-right.
- Empty states: centered icon + short headline + one-line hint + primary action.
- Honesty: no fake/"coming soon" buttons that only toast (the Facebook connect facade
  was removed). Disabled "coming soon" channel rows are acceptable honest state.

## Icons

MUI icons, "Rounded"/"Outlined" variants, typically 16–22px, `text.secondary` unless
active.
