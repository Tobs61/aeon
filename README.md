# Aeon

A lightweight, local-first calendar app that reads and writes standard `.ics` files directly from your folders.

## Features

- **Folder-first `.ics` storage**: Recursively scans a folder for `.ics` files and writes changes straight back to standard `VCALENDAR` / `VEVENT` files. Works on desktop (Linux, macOS, Windows via Tauri) or in any modern browser.
- **Four calendar views**: Day (`1` / `D`), Week (`2` / `W`), Month (`3` / `M`), and Year (`4` / `Y`).
- **Direct scheduling**: Click any slot to create an event, drag events to reschedule across days/times, and drag event edges in Day/Week views to resize duration.
- **Reminders & sound**: Configurable event notifications (in-app banners, desktop alerts, and notification chime) with standard `VALARM` `.ics` persistence.
- **Recurrence & inspection**: Supports standard `RRULE` schedules (`DAILY`, `WEEKLY` with `BYDAY`, `MONTHLY`, `YEARLY`), live `.ics` preview in the editor, and copy/download of raw `.ics` source.
- **Workspace polish**: Per-calendar color coding and visibility toggles, search filter (`/`), custom window title bar with version display, context-aware right-click menu, and light/dark monochrome themes (`\`).

## Requirements

- [Bun](https://bun.sh/) and [Node.js](https://nodejs.org/) (for dev server, TypeScript checks, and build scripts)
- [Rust](https://www.rust-lang.org/) and [Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/) (only needed for desktop builds)
- `flatpak` and `flatpak-builder` (only needed for `.flatpak` bundles)

## Getting Started

```bash
bun install
bun run dev
```

`bun run dev` starts the local Express `.ics` API and Vite dev server at `http://localhost:3000`. Aeon reads and writes `.ics` files in `data/calendars/` by default or any folder you select in Settings.

Other common commands:

```bash
bun run lint        # Type-check with TypeScript (tsc --noEmit)
bun run start       # Serve the built dist/ bundle via server.ts
bun run tauri:dev   # Launch the Tauri desktop app in development mode
```

## Build & Clean Scripts

### Build (`scripts/build.ts`)

All web and desktop builds run through `scripts/build.ts`:

```bash
# Default: build the web bundle into dist/
bun run build

# Build one or more desktop targets
bun run build -- --target .deb
bun run build -- --target .deb,.appimage,.flatpak
bun run build -- .exe
```

Supported targets (leading dot is optional):

| Target | Output |
| --- | --- |
| `.flatpak` | Flatpak bundle (`dist-flatpak/aeon-<version>.flatpak` via `com.kael.aeon.yml`) |
| `.exe` | Windows NSIS installer |
| `.msi` | Windows MSI installer |
| `.dmg` | macOS disk image |
| `.rpm` | Linux RPM package |
| `.appimage` | Linux AppImage |
| `.deb` | Debian/Ubuntu package |

Build options:

- `-t, --target <list>` — Comma-separated list of targets to build
- `-a, --all` — Build all supported desktop targets
- `-n, --dry-run` — Print commands without executing them
- `-h, --help` — Show CLI help

### Clean (`scripts/clean.ts`)

Remove generated web, Rust/Tauri, Flatpak, and installer artifacts:

```bash
bun run clean
```

Clean options:

- `-n, --dry-run` — Preview paths that would be removed without deleting anything
- `-a, --all` — Also remove Vite and TypeScript caches (`node_modules/.vite`, `tsconfig.tsbuildinfo`)
- `-h, --help` — Show CLI help

## Keyboard Shortcuts

- `T` — Jump to Today
- `1` / `D`, `2` / `W`, `3` / `M`, `4` / `Y` — Switch between Day, Week, Month, and Year views
- `←` / `H` and `→` / `L` — Navigate to previous or next period
- `N` / `C` — Create a new event (`E` to edit a selected event)
- `/` — Focus event search
- `B` / `[` — Toggle sidebar
- `R` — Rescan active folder
- `\` — Toggle light/dark theme
- `,` — Open Settings
- `?` — Toggle shortcuts reference
- `Esc` — Close context menu or open dialog
