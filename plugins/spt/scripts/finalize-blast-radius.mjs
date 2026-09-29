#!/usr/bin/env node
// Step 1 exit gate: locks the reviewed blast radius so scenario generation works from a fixed scope.
//   finalise : records who finalised blast-radius.json and its SHA-256 in run.json
//   verify   : exits 0 only if the blast radius is finalised and unchanged since
// Usage: node finalize-blast-radius.mjs finalise [--by "Name"] | verify
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { runDir, readJson, writeJson, sha256, arg, requireGate } from './lib/common.mjs';

const cmd = process.argv[2];
const dir = runDir();
const brFile = path.join(dir, 'blast-radius.json');
const runFile = path.join(dir, 'run.json');
const run = readJson(runFile);
// The user may skip the blast radius analysis and go straight to the test cases; then there is nothing to lock.
const skipped = run.gates?.analysis?.decision === 'skip' && !fs.existsSync(brFile);
if (!skipped && !fs.existsSync(brFile)) { console.error('blast-radius.json not found. Run the impact analysis first.'); process.exit(1); }
const hash = skipped ? null : sha256(fs.readFileSync(brFile, 'utf8'));

if (cmd === 'finalise' || cmd === 'finalize') {
  requireGate('testgen', dir);
  let by = arg('by');
  if (!by) { try { by = execSync('git config user.name', { encoding: 'utf8' }).trim(); } catch { /* ignore */ } }
  run.blastRadius = skipped
    ? { skipped: true, finalisedBy: by || 'unknown', finalisedAt: new Date().toISOString(), hash: null, components: 0 }
    : { finalisedBy: by || 'unknown', finalisedAt: new Date().toISOString(), hash, components: (readJson(brFile).components || []).length };
  run.status = 'blast_radius_finalised';
  writeJson(runFile, run);
  console.log(JSON.stringify({ finalised: true, ...run.blastRadius }, null, 2));
} else if (cmd === 'verify') {
  if (run.blastRadius?.skipped) { console.log(JSON.stringify({ ok: true, skipped: true })); process.exit(0); }
  if (!run.blastRadius?.hash) { console.error('Blast radius not finalised. It is finalised when the user approves test-case generation.'); process.exit(2); }
  if (run.blastRadius.hash !== hash) { console.error('blast-radius.json changed after it was finalised. Ask the user to approve test-case generation again.'); process.exit(2); }
  console.log(JSON.stringify({ ok: true, ...run.blastRadius }));
} else {
  console.error('Usage: finalize-blast-radius.mjs finalise [--by "Name"] | verify'); process.exit(1);
}
