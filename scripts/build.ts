import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

type BundleTarget =
  | 'web'
  | 'flatpak'
  | 'exe'
  | 'dmg'
  | 'msi'
  | 'rpm'
  | 'appimage'
  | 'deb';

const DESKTOP_TARGETS: Array<Exclude<BundleTarget, 'web'>> = [
  'flatpak',
  'exe',
  'dmg',
  'msi',
  'rpm',
  'appimage',
  'deb',
];

const SUPPORTED_TARGETS: BundleTarget[] = ['web', ...DESKTOP_TARGETS];

const TAURI_BUNDLE_MAP: Record<Exclude<BundleTarget, 'flatpak' | 'web'>, string> = {
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
    return pkg.version || '0.1.18';
  } catch {
    return '0.1.18';
  }
}

function addTargets(rawValue: string, targets: BundleTarget[]): void {
  for (const part of rawValue.split(',')) {
    const cleaned = part.trim().toLowerCase().replace(/^\./, '');
    if (!SUPPORTED_TARGETS.includes(cleaned as BundleTarget)) {
      throw new Error(
        `Unsupported target "${part}". Supported: ${DESKTOP_TARGETS.map((t) => `.${t}`).join(', ')}`
      );
    }
    const parsed = cleaned as BundleTarget;
    if (!targets.includes(parsed)) {
      targets.push(parsed);
    }
  }
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
    shell: process.platform === 'win32' && !path.isAbsolute(cmd),
  });

  if (result.error) {
    throw new Error(`Failed to execute "${cmd}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runTauri(args: string[], dryRun: boolean): void {
  const tauriEntry = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  if (fs.existsSync(tauriEntry)) {
    runStep(process.execPath, [tauriEntry, ...args], dryRun);
  } else {
    runStep('bunx', ['tauri', ...args], dryRun);
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
      addTargets(value, targets);
    } else if (arg.startsWith('--target=')) {
      addTargets(arg.slice('--target='.length), targets);
    } else if (!arg.startsWith('-')) {
      addTargets(arg, targets);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { targets, all, dryRun, help };
}

function buildFlatpak(version: string, dryRun: boolean, debAlreadyBuilt: boolean): void {
  if (!debAlreadyBuilt) {
    runTauri(['build', '--bundles', 'deb'], dryRun);
  }

  const outDir = path.join(ROOT, 'dist-flatpak');
  const buildDir = path.join(outDir, 'build-dir');
  const repoDir = path.join(outDir, 'repo');
  const bundlePath = path.join(outDir, `aeon-${version}.flatpak`);

  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const flatpakBuilderArgs = ['--force-clean'];
  if (process.env.CI === 'true' || !fs.existsSync('/dev/fuse')) {
    flatpakBuilderArgs.push('--disable-rofiles-fuse');
  }
  flatpakBuilderArgs.push(`--repo=${repoDir}`, buildDir, 'com.kael.aeon.yml');

  runStep('flatpak-builder', flatpakBuilderArgs, dryRun);
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

  const chosenTargets = all ? [...DESKTOP_TARGETS] : targets;

  // Default behavior when called with no targets or only "web"
  if (
    chosenTargets.length === 0 ||
    (chosenTargets.length === 1 && chosenTargets[0] === 'web')
  ) {
    const viteEntry = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    if (fs.existsSync(viteEntry)) {
      runStep(process.execPath, [viteEntry, 'build'], dryRun);
    } else {
      runStep('bunx', ['vite', 'build'], dryRun);
    }
    return;
  }

  const version = readAppVersion();
  const desktopTargets = chosenTargets.filter((t) => t !== 'web');
  const tauriBundles = desktopTargets
    .filter((t): t is Exclude<BundleTarget, 'flatpak' | 'web'> => t !== 'flatpak')
    .map((t) => TAURI_BUNDLE_MAP[t]);

  const wantsFlatpak = desktopTargets.includes('flatpak');

  if (tauriBundles.length > 0) {
    runTauri(['build', '--bundles', tauriBundles.join(',')], dryRun);
  }

  if (wantsFlatpak) {
    buildFlatpak(version, dryRun, tauriBundles.includes('deb'));
  }

  console.log(
    dryRun
      ? `Dry run complete for target(s): ${desktopTargets.map((t) => `.${t}`).join(', ')}`
      : `Build complete for target(s): ${desktopTargets.map((t) => `.${t}`).join(', ')}`
  );
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Build error: ${msg}`);
  process.exit(1);
}
