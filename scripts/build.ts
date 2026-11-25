import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

type BundleTarget =
  | 'flatpak'
  | 'exe'
  | 'dmg'
  | 'msi'
  | 'rpm'
  | 'appimage'
  | 'deb';

const SUPPORTED_TARGETS: BundleTarget[] = [
  'flatpak',
  'exe',
  'dmg',
  'msi',
  'rpm',
  'appimage',
  'deb',
];

const TAURI_BUNDLE_MAP: Record<Exclude<BundleTarget, 'flatpak'>, string> = {
  exe: 'nsis',
  dmg: 'dmg',
  msi: 'msi',
  rpm: 'rpm',
  appimage: 'appimage',
  deb: 'deb',
};

const ROOT = process.cwd();

function readAppVersion(): string {
  try {
    const pkgRaw = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    return pkg.version || '0.1.12';
  } catch {
    return '0.1.12';
  }
}

function normalizeTarget(raw: string): BundleTarget | null {
  const cleaned = raw.trim().toLowerCase().replace(/^\./, '');
  if (SUPPORTED_TARGETS.includes(cleaned as BundleTarget)) {
    return cleaned as BundleTarget;
  }
  return null;
}

function printHelp(): void {
  console.log(`Aeon build script

Usage:
  bun run build                                  Build web bundle (vite build)
  bun run build -- --target <targets>            Build desktop package(s)
  bun run build -- <target...>                   Build desktop package(s)

Supported targets:
  .flatpak   Flatpak bundle (via com.kael.aeon.yml)
  .exe       Windows NSIS installer
  .dmg       macOS disk image
  .msi       Windows MSI installer
  .rpm       Linux RPM package
  .appimage  Linux AppImage
  .deb       Debian/Ubuntu .deb package

Options:
  -t, --target <list>  Comma-separated list of targets (e.g. .deb,.appimage,.flatpak)
  -a, --all            Attempt all supported desktop targets
      --dry-run        Print the build commands without executing them
  -h, --help           Show this help message
`);
}

function runStep(cmd: string, args: string[], dryRun: boolean): void {
  const pretty = [cmd, ...args].join(' ');
  console.log(`> ${pretty}`);
  if (dryRun) return;

  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw new Error(`Failed to execute "${cmd}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseCli(argv: string[]): {
  targets: BundleTarget[];
  all: boolean;
  dryRun: boolean;
  help: boolean;
} {
  const targets: BundleTarget[] = [];
  let all = false;
  let dryRun = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
    } else if (arg === '--all' || arg === '-a') {
      all = true;
    } else if (arg === '--target' || arg === '-t') {
      const value = argv[++i];
      if (!value) {
        throw new Error(`Missing value after ${arg}`);
      }
      for (const part of value.split(',')) {
        const parsed = normalizeTarget(part);
        if (!parsed) {
          throw new Error(
            `Unsupported target "${part}". Supported: ${SUPPORTED_TARGETS.map((t) => `.${t}`).join(', ')}`
          );
        }
        if (!targets.includes(parsed)) targets.push(parsed);
      }
    } else if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length);
      for (const part of value.split(',')) {
        const parsed = normalizeTarget(part);
        if (!parsed) {
          throw new Error(
            `Unsupported target "${part}". Supported: ${SUPPORTED_TARGETS.map((t) => `.${t}`).join(', ')}`
          );
        }
        if (!targets.includes(parsed)) targets.push(parsed);
      }
    } else if (!arg.startsWith('-')) {
      for (const part of arg.split(',')) {
        const parsed = normalizeTarget(part);
        if (!parsed) {
          throw new Error(
            `Unsupported target "${part}". Supported: ${SUPPORTED_TARGETS.map((t) => `.${t}`).join(', ')}`
          );
        }
        if (!targets.includes(parsed)) targets.push(parsed);
      }
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { targets, all, dryRun, help };
}

function buildFlatpak(version: string, dryRun: boolean, debAlreadyBuilt: boolean): void {
  if (!debAlreadyBuilt) {
    runStep('bunx', ['tauri', 'build', '--bundles', 'deb'], dryRun);
  }

  const outDir = path.join(ROOT, 'dist-flatpak');
  const buildDir = path.join(outDir, 'build-dir');
  const repoDir = path.join(outDir, 'repo');
  const bundlePath = path.join(outDir, `aeon-${version}.flatpak`);

  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  runStep(
    'flatpak-builder',
    ['--force-clean', `--repo=${repoDir}`, buildDir, 'com.kael.aeon.yml'],
    dryRun
  );
  runStep(
    'flatpak',
    ['build-bundle', repoDir, bundlePath, 'com.kael.aeon'],
    dryRun
  );
}

function main(): void {
  const { targets, all, dryRun, help } = parseCli(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  const chosenTargets = all ? [...SUPPORTED_TARGETS] : targets;

  // Default behavior when called with no targets (e.g., `npm run build` / `bun run build`)
  if (chosenTargets.length === 0) {
    const viteBin = path.join(ROOT, 'node_modules', '.bin', 'vite');
    if (fs.existsSync(viteBin)) {
      runStep(viteBin, ['build'], dryRun);
    } else {
      runStep('bunx', ['vite', 'build'], dryRun);
    }
    return;
  }

  const version = readAppVersion();
  const tauriBundles = chosenTargets
    .filter((t): t is Exclude<BundleTarget, 'flatpak'> => t !== 'flatpak')
    .map((t) => TAURI_BUNDLE_MAP[t]);

  const wantsFlatpak = chosenTargets.includes('flatpak');

  if (tauriBundles.length > 0) {
    runStep('bunx', ['tauri', 'build', '--bundles', tauriBundles.join(',')], dryRun);
  }

  if (wantsFlatpak) {
    buildFlatpak(version, dryRun, tauriBundles.includes('deb'));
  }

  console.log(
    dryRun
      ? `Dry run complete for target(s): ${chosenTargets.map((t) => `.${t}`).join(', ')}`
      : `Build complete for target(s): ${chosenTargets.map((t) => `.${t}`).join(', ')}`
  );
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Build error: ${msg}`);
  process.exit(1);
}
