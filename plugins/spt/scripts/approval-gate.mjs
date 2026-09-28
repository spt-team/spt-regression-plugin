#!/usr/bin/env node
// Human approval gate before test execution (workflow stage 6).
//   freeze [--all] : approve all scenarios (--all) or only those ticked [x] in scenarios.md; writes approved-scenarios.json (hash-locked)
//   reject         : the user declined execution; records it and stops the workflow
//   verify         : exits 0 only if approval exists and approved scenarios are unchanged since approval
//   revoke         : deletes the approval
// Usage: node approval-gate.mjs freeze [--all] --approver "Jane Smith" | reject [--approver ...] | verify | revoke
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { runDir, readJson, writeJson, sha256, loadConfig, arg, requireGate } from './lib/common.mjs';

const cmd = process.argv[2];
const dir = runDir();
const runFile = path.join(dir, 'run.json');
const scenariosJson = path.join(dir, 'scenarios.json');
const scenariosMd = path.join(dir, 'scenarios.md');
const approvedFile = path.join(dir, 'approved-scenarios.json');
const cfg = loadConfig() || {};

const hashOf = list => sha256(JSON.stringify(list.map(({ testMethod, ...s }) => s)));
function approverName() {
  let a = arg('approver');
  if (!a) { try { a = execSync('git config user.name', { encoding: 'utf8' }).trim(); } catch { /* ignore */ } }
  return a;
}
function recordGate(decision, by) {
  const run = readJson(runFile);
  run.gates = { ...(run.gates || {}), execution: { decision, by: by || 'unknown', at: new Date().toISOString() } };
  run.status = decision === 'yes' ? 'approved' : 'stopped_at_execution';
  writeJson(runFile, run);
  return run;
}

if (cmd === 'freeze') {
  requireGate('testgen', dir);
  if (!fs.existsSync(scenariosJson)) { console.error('scenarios.json not found. Generate the test cases first.'); process.exit(1); }
  const approver = approverName();
  if (cfg.approval?.requireApproverName !== false && !approver) { console.error('Approver name required: --approver "Full Name"'); process.exit(1); }

  const all = readJson(scenariosJson).scenarios;
  let approved, rejected;
  if (process.argv.includes('--all')) {
    approved = all; rejected = [];
  } else {
    if (!fs.existsSync(scenariosMd)) { console.error('scenarios.md not found.'); process.exit(1); }
    const md = fs.readFileSync(scenariosMd, 'utf8');
    const ticked = new Set([...md.matchAll(/^\s*-\s*\[[xX]\]\s*\**(SC-\d{3})/gm)].map(m => m[1]));
    approved = all.filter(s => ticked.has(s.id));
    rejected = all.filter(s => !ticked.has(s.id)).map(s => s.id);
  }
  const min = cfg.approval?.minApprovedScenarios ?? 1;
  if (approved.length < min) { console.error(`Only ${approved.length} test case(s) approved; at least ${min} required. Tick "- [x] SC-###" lines in scenarios.md.`); process.exit(1); }

  const run = recordGate('yes', approver);
  writeJson(approvedFile, {
    status: 'approved', approver, approvedAt: new Date().toISOString(), blastRadiusHash: run.blastRadius?.hash || null,
    approvedCount: approved.length, rejected, hash: hashOf(approved), scenarios: approved,
  });
  console.log(JSON.stringify({ approved: approved.length, rejected: rejected.length, approver, file: approvedFile }, null, 2));
} else if (cmd === 'reject') {
  requireGate('testgen', dir);
  if (fs.existsSync(approvedFile)) fs.unlinkSync(approvedFile);
  recordGate('no', approverName());
  console.log(JSON.stringify({ execution: 'declined', message: 'Workflow stopped. No tests were executed.' }));
} else if (cmd === 'verify') {
  if (!fs.existsSync(approvedFile)) { console.error('NOT APPROVED: the user has not approved test execution for this run.'); process.exit(2); }
  const rec = readJson(approvedFile);
  if (rec.status !== 'approved' || hashOf(rec.scenarios) !== rec.hash) { console.error('APPROVAL INVALID: approved test cases were modified after approval. Ask the user to approve again.'); process.exit(2); }
  const brHash = readJson(runFile).blastRadius?.hash || null;
  if (rec.blastRadiusHash && rec.blastRadiusHash !== brHash) { console.error('APPROVAL INVALID: the blast radius changed after approval. Regenerate the test cases and ask for approval again.'); process.exit(2); }
  console.log(JSON.stringify({ ok: true, approver: rec.approver, approvedAt: rec.approvedAt, count: rec.approvedCount }));
} else if (cmd === 'revoke') {
  if (fs.existsSync(approvedFile)) fs.unlinkSync(approvedFile);
  console.log('Approval revoked.');
} else {
  console.error('Usage: approval-gate.mjs freeze [--all] | reject | verify | revoke'); process.exit(1);
}
