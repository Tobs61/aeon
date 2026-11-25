# Aeon

A lightweight local-first desktop calendar that reads and writes standard `.ics` files directly from your folders.

## Scripts

### Clean build artifacts

Remove generated web, Rust/Tauri, Flatpak, and installer artifacts:

```bash
bun run clean
```

Options:
- `--dry-run` (`-n`): Preview paths that would be removed without deleting them.
- `--all` (`-a`): Also clear Vite and TypeScript caches (`node_modules/.vite`, `tsconfig.tsbuildinfo`).

### Build

All builds go through `scripts/build.ts`:

```bash
# Default web bundle (Vite -> dist/)
bun run build

# Build one or more desktop targets
bun run build -- --target .deb
bun run build -- --target .deb,.appimage,.flatpak
bun run build -- .exe
```

Supported targets (leading dot optional):
- `.flatpak` — Flatpak bundle (via `com.kael.aeon.yml`)
- `.exe` — Windows NSIS installer
- `.msi` — Windows MSI installer
- `.dmg` — macOS disk image
- `.rpm` — Linux RPM package
- `.appimage` — Linux AppImage
- `.deb` — Debian/Ubuntu package

Options:
- `-t, --target <list>`: Comma-separated target(s) to build.
- `-a, --all`: Attempt all desktop targets.
- `--dry-run` (`-n`): Print build commands without running them.
- `-h, --help`: Show CLI help.
