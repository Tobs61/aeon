import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

const ARTIFACT_PATHS = [
  'dist',
  'dist-flatpak',
  'build-dir',
  '.flatpak-builder',
  'server.js',
  'src-tauri/target',
  'src-tauri/gen/schemas',
];

const ARTIFACT_EXTENSIONS = [
  '.deb',
  '.rpm',
  '.appimage',
  '.flatpak',
  '.exe',
  '.msi',
  '.dmg',
];

function parseArgs(argv: string[]): { dryRun: boolean; help: boolean; includeCache: boolean } {
  let dryRun = false;
  let help = false;
  let includeCache = false;

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--all' || arg === '-a') {
      includeCache = true;
    }
  }

  return { dryRun, help, includeCache };
}

function collectBundleFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'data') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (ARTIFACT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        out.push(full);
      }
    }
  }
}

function main(): void {
  const { dryRun, help, includeCache } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(`Aeon clean script

Usage:
  bun run clean [--dry-run] [--all]

Options:
  -n, --dry-run   Show artifacts that would be removed without deleting them
  -a, --all       Also remove Vite and TypeScript cache artifacts
  -h, --help      Show this help message
`);
    return;
  }

  const targets = [...ARTIFACT_PATHS];
  if (includeCache) {
    targets.push('node_modules/.vite', 'tsconfig.tsbuildinfo');
  }

  const resolvedTargets = targets.map((rel) => path.resolve(ROOT, rel));
  collectBundleFiles(ROOT, resolvedTargets);

  const uniqueTargets = Array.from(new Set(resolvedTargets));
  let removedCount = 0;

  for (const target of uniqueTargets) {
    if (!fs.existsSync(target)) continue;
    const rel = path.relative(ROOT, target) || target;
    if (dryRun) {
      console.log(`[dry-run] would remove ${rel}`);
    } else {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`removed ${rel}`);
    }
    removedCount++;
  }

  if (removedCount === 0) {
    console.log('No build artifacts found.');
  } else {
    console.log(
      dryRun
        ? `${removedCount} build artifact path(s) would be removed.`
        : `Cleaned ${removedCount} build artifact path(s).`
    );
  }
}

main();
