# Aeon Design System (`DESIGN.md`)

This document defines the visual language, typography, color tokens, spatial grid, and interaction patterns used across Aeon. Follow these conventions when modifying Aeon or building companion projects so every surface feels cohesive, calm, and unmistakably part of the same family.

---

## 1. Design Philosophy

- **Monochrome-first clarity**: The application chrome is strictly neutral grayscale. Color is used almost exclusively to identify user calendars (`.ics` sources) and the live current-time marker—never as decorative gradients or background noise.
- **Hairline structure over heavy elevation**: Separate regions with crisp `1px` neutral borders rather than thick dividers, boxed cards around everything, or heavy drop shadows. Reserve shadows strictly for floating layers (modals, drawers, context menus, dropdowns, toasts).
- **Desktop-native restraint**: Full-viewport fixed shell, zero clutter, direct manipulation (click, drag, resize, wheel-step, right-click), and keyboard-first ergonomics.
- **Light & Dark parity**: Both modes are first-class, deliberately tuned high-contrast monochrome themes rather than inverted hacks.

---

## 2. Color System

All UI surfaces use Tailwind's `neutral` scale anchored by explicit dark-surface hex steps (`#0a0a0a` to `#242424`).

### 2.1 Monochrome Surface & Ink Tokens

| Role | Light Mode | Dark Mode |
| --- | --- | --- |
| **App canvas / Main grid** | `#ffffff` (`bg-white`) | `#0a0a0a` (`dark:bg-[#0a0a0a]`) |
| **Secondary chrome (TitleBar, Sidebar, Footer)** | `#fafafa` (`bg-neutral-50`) | `#0f0f0f` (`dark:bg-[#0f0f0f]`) |
| **Modal / Drawer surface** | `#ffffff` (`bg-white`) | `#121212` (`dark:bg-[#121212]`) |
| **Floating surface (Toasts, ContextMenu, Inputs)** | `bg-white/95` or `bg-neutral-100/80` | `dark:bg-[#141414]/95` to `dark:bg-[#181818]` |
| **Interactive hover / elevated pill** | `bg-neutral-100` / `bg-neutral-200/70` | `dark:bg-[#1f1f1f]` / `dark:bg-[#242424]` |
| **Primary hairline border** | `border-neutral-200` (`#e5e5e5`) | `dark:border-neutral-800` (`#262626`) |
| **Subtle gridline border** | `border-neutral-200/70` | `dark:border-neutral-800/70` |
| **Primary ink** | `text-neutral-900` (`#171717`) | `dark:text-white` / `dark:text-neutral-100` |
| **Secondary ink** | `text-neutral-500` / `text-neutral-600` | `dark:text-neutral-400` / `dark:text-neutral-300` |
| **Muted ink (counts, shortcuts, version)** | `text-neutral-400` | `dark:text-neutral-500` |
| **Backdrop scrim** | `bg-black/35 backdrop-blur-[2px]` | `dark:bg-black/65 backdrop-blur-[2px]` |

### 2.2 Primary Action & Inverted Accent

Primary CTAs (e.g., `Save Event`, `Done`, active `Today` indicator in mini-calendar, active toggle switches, destructive confirmation) use an **inverted monochrome fill**:

- **Light**: `bg-neutral-900 hover:bg-neutral-800 text-white`
- **Dark**: `dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950`

### 2.3 Semantic Calendar Palette

Each `.ics` calendar is assigned one of 8 soft-tinted color keys defined in `src/lib/colors.ts`:

| Key | Label | Event Surface Character |
| --- | --- | --- |
| `blue` | Sky | `sky-50/90` fill, `sky-200/75` border (`dark: sky-950/45`, `sky-800/55`) |
| `emerald` | Sage | `emerald-50/90` fill, `emerald-200/75` border |
| `teal` | Seafoam | `teal-50/90` fill, `teal-200/75` border |
| `amber` | Honey | `amber-50/90` fill, `amber-200/75` border |
| `rose` | Blush | `rose-50/90` fill, `rose-200/75` border |
| `indigo` | Periwinkle | `indigo-50/90` fill, `indigo-200/75` border |
| `violet` | Lavender | `violet-50/90` fill, `violet-200/75` border |
| `slate` | Mono | `neutral-100` fill, `neutral-300/85` border (`dark: neutral-900`, `neutral-700/80`) |

**Rules**:
- Event cards use translucent soft fills + `1px` tinted borders + high-contrast text (`*-900` / `*-100`), never opaque loud blocks.
- Calendar swatches and notification indicators use compact `rounded-full` dots (`h-2 w-2` or `h-2.5 w-2.5`).

---

## 3. Typography

Fonts are loaded in `index.html` and mapped via `@theme` in `src/index.css`:

| Token | Font Family | Usage |
| --- | --- | --- |
| `--font-display` | `Plus Jakarta Sans`, `system-ui`, sans-serif | Period titles (`h1`), modal/drawer headings (`h2`, `h3`), brand wordmark (`Aeon`) |
| `--font-sans` | `DM Sans`, `system-ui`, sans-serif | Default UI labels, buttons, event titles, notes, menus |
| `--font-mono` | `JetBrains Mono`, `ui-monospace`, monospace | Timestamps, durations, keyboard hints (`<kbd>`), `.ics` filenames, UIDs, raw `.ics` previews, `vX.Y.Z` version tag |

### Type Scale & Rules

- **Numeric alignment**: Always add `.tabular-nums` (`font-variant-numeric: tabular-nums`) on times, dates, event counts, mini-month days, and version labels.
- **Compact UI density**: Standard controls use `text-xs` (`12px`) or `text-sm` (`14px`) with tight tracking (`tracking-tight`) on display titles (`text-base sm:text-lg` in TopBar, `text-2xl` in EventInspectorDrawer).
- **Antialiasing**: Always enabled globally (`-webkit-font-smoothing: antialiased`).

---

## 4. Layout, Chrome & Spatial Structure

- **Viewport Shell**: `h-screen w-screen overflow-hidden flex flex-col` so scrolling happens strictly inside calendar timelines, event lists, or modal bodies—never on the outer document.
- **Custom Window TitleBar (`h-8` / `32px`)**:
  - Draggable across the window (`data-tauri-drag-region`), ignoring double-clicks during drag start (`e.detail > 1`).
  - Left side displays only the unobtrusive monospace version (`vX.Y.Z`). Keep redundant titles, logos, and theme toggles out of the TitleBar.
  - Right side houses flush, square-cornered (`rounded-none`), `w-11` (`44px`) full-height (`h-full`) window buttons (`Minimize`, `Maximize/Restore`, `Close`) so the close button reaches the exact top-right pixel corner.
- **Sidebar (`w-[260px]`)**:
  - Brand lockup header (`h-14` matching TopBar height) with monochrome square icon (`bg-black border border-neutral-800/80 rounded-lg`) and `Aeon` wordmark.
  - Mini-month calendar supporting scroll-wheel month stepping (`useWheelPeriodStep`).
  - Calendar list with custom color-dot checkboxes, hover palette picker, and monospace counts.
  - Bottom utility bar with Settings trigger.
- **TopBar (`h-14` / `56px`)**:
  - Left: Sidebar expand/mobile trigger (when collapsed), `Today` pill-box button, `<` `>` navigation chevrons, and display period title.
  - Right: Inline search input (`/`), segmented 4-mode switcher (`Day | Week | Month | Year`), icon buttons for Shortcuts (`?`) and Rescan (`R`), and primary `+` Create Event CTA.
- **Calendar Views**:
  - **Day / Week**: Synchronized time gutter + sticky all-day strip + draggable/resizable event blocks.
  - **Month**: Clean hairline 7-column grid with compact event chips.
  - **Year**: Open, airy 12-month grid **without** enclosing card boxes around individual months (`YearView` renders typography + day matrix directly on canvas).

---

## 5. Shape, Borders & Layering

### Border Radius Scale

- `rounded-md` (`6px`): Inline checkboxes and micro badges.
- `rounded-lg` (`8px`): Segmented control inner active tabs, menu items, mini-calendar day cells, brand icon container.
- `rounded-xl` (`12px`): Inputs, buttons, dropdown menus, context menu container, small notice boxes.
- `rounded-2xl` (`16px`): Modals, floating notification toasts, loading skeleton columns.
- `rounded-full`: Calendar color dots, current-time indicator dot.
- `rounded-none`: TitleBar window control buttons (flush edge-to-edge hit targets).

### Elevation & Z-Index Stack

| Layer | `z-index` | Shadow / Surface |
| --- | --- | --- |
| Base app & calendar grids | `z-0` | Flat with `1px` hairline borders |
| Custom TitleBar | `z-30` | Flat with bottom hairline |
| Modals & Event Inspector Drawer | `z-50` | `shadow-2xl` + backdrop scrim |
| Notification Toasts | `z-[90]` | `shadow-xl` + `backdrop-blur-md` |
| Context Menu | `z-[100]` / `z-[101]` | `shadow-xl` + `backdrop-blur-md` (always topmost, works over open overlays) |

---

## 6. Controls, Feedback & Motion

- **Custom Dropdowns**: Never rely on unstyled native `<select>` popups for primary form selectors (`Calendar`, `Recurrence`, `Reminder`); use custom keyboard-accessible (`Escape`, outside-pointer-down) `role="listbox"` popovers matching the monochrome `rounded-xl` surface.
- **Context Menu**: Single unified right-click menu adapting dynamically to target kind (`event`, `calendar`, `slot`, or `general`), including a `Close dialog` (`Esc`) item when opened over an active overlay.
- **Notifications & Sound**:
  - Event reminders surface via bottom-right monochrome toast cards (`NotificationToasts`, max 4 visible, click to inspect) alongside optional OS notifications (`silent: true`).
  - Audio feedback uses a gentle synthesized two-note sine chime (`880 Hz -> 1318.51 Hz`) via Web Audio API, avoiding harsh system beeps.
  - Never use blocking `window.alert`, `window.confirm`, or `window.open`.
- **Keyboard Discipline**: Single-key shortcuts (`D/W/M/Y`, `T`, `N/C`, `E`, `/`, `B`, `R`, `\`, `,`, `?`, `Esc`) must always ignore events when modifier keys (`Cmd`, `Ctrl`, `Alt`) are held or when typing inside form fields.
- **Motion & Scrollbars**: Subtle `duration-200 ease-out` transitions (`prefers-reduced-motion: reduce` collapses animations to `0.01ms`) and `6px` transparent-track monochrome scrollbars.

---

## 7. Brand & Asset Guidelines

- **Logo**: `public/assets/aeon-logo.svg` — minimalist monochrome emblem housed in a solid `#000000` rounded square (`rounded-lg`) in UI lockups.
- **Desktop App Icons**: Generated from `src-tauri/icons/icon.png` (`32x32`, `64x64`, `128x128`, `128x128@2x`, `icon.icns`, `icon.ico`, `icon.svg`) with `#0a0a0a` background alignment.
- **Version Visibility**: Always surface the current semantic version (`v{APP_VERSION}`, sourced from `package.json` via `src/lib/version.ts`) subtly in the TitleBar and Settings footer.
