// Shared helpers for SPT scripts. No external dependencies (Node >= 18).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const SPT_DIR = path.join(PROJECT_ROOT, '.spt');
export const RUNS_DIR = path.join(SPT_DIR, 'runs');
export const INDEX_FILE = path.join(SPT_DIR, 'index', 'metadata-index.json');
export const CURRENT_FILE = path.join(SPT_DIR, 'current-run');

export function loadConfig() {
  const p = path.join(PROJECT_ROOT, 'spt.config.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

export function currentRunId() {
  return fs.existsSync(CURRENT_FILE) ? fs.readFileSync(CURRENT_FILE, 'utf8').trim() : null;
}
export function runDir(runId = currentRunId()) {
  if (!runId) throw new Error('No active SPT run. Start one with /spt:start.');
  return path.join(RUNS_DIR, runId);
}

export function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

export function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

export function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
export function args(name) {
  const out = [];
  process.argv.forEach((a, i) => { if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]); });
  return out;
}

// Minimal XML helpers (regex-based; sufficient for Salesforce source-format metadata)
export function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
}
export function tags(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map(m => m[1].trim());
}
export function blocks(xml, name) { return tags(xml, name); }

// Human decisions recorded at each workflow gate (see workflow.mjs).
export const GATES = ['analysis', 'e2e', 'testgen', 'execution', 'failures'];
export function requireGate(gate, dir = runDir()) {
  const runFile = path.join(dir, 'run.json');
  const g = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, 'utf8')).gates?.[gate] : null;
  if (g?.decision !== 'yes') {
    console.error(`SPT workflow: the "${gate}" stage has not been approved by the user${g?.decision === 'no' ? ' (they declined; the workflow is stopped)' : ''}. Ask the user first via /spt:start.`);
    process.exit(2);
  }
}
