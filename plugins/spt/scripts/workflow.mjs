#!/usr/bin/env node
// Workflow state and human-approval gates for the guided /spt:start flow.
//   status                                    -> current run, stage reached, next stage, recorded decisions
//   gate <analysis|e2e|testgen|failures> --decision yes|no [--scope impact|org] [--by "Name"]
//                                             --scope is required for "e2e" yes: impact = impacted areas and blast radius, org = overall org metadata
//   check <analysis|e2e|testgen|execution|failures>   exit 0 only if the user approved that gate
//   reopen                                    clear a declined ("no") gate so the question can be asked again
//   reset-execution                           archive the last execution (results, failure analysis) into attempt-<n>/ for a re-run
// The execution gate is recorded by approval-gate.mjs (freeze = yes, reject = no).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { currentRunId, runDir, readJson, writeJson, arg, requireGate, GATES, RUNS_DIR } from './lib/common.mjs';

const [cmd, gate] = process.argv.slice(2);

if (cmd === 'status') {
  const runId = currentRunId();
  if (!runId || !fs.existsSync(path.join(RUNS_DIR, runId, 'run.json'))) { console.log(JSON.stringify({ runId: null, next: 'upload' })); process.exit(0); }
  const dir = runDir(runId);
  const run = readJson(path.join(dir, 'run.json'));
  const has = f => fs.existsSync(path.join(dir, f));
  const g = run.gates || {};
  const stopped = GATES.find(k => g[k]?.decision === 'no');
  let next;
  if (stopped) next = `stopped (user declined ${stopped})`;
  else if (!g.analysis) next = 'ask-analysis';
  else if (!has('blast-radius.json')) next = 'analyse';
  // Runs whose tests were generated before the e2e gate existed (<= 0.3.1) skip it.
  else if (!g.e2e && !g.testgen) next = 'ask-e2e';
  else if (g.e2e && !has('e2e-simulation.json')) next = 'simulate-e2e';
  else if (!g.testgen) next = 'ask-testgen';
  else if (!has('scenarios.json')) next = 'generate-tests';
  else if (!g.execution) next = 'ask-execution';
  else if (!has('results.json')) next = 'execute';
  else if (!g.failures) next = 'ask-failures';
  else if (!has('failure-analysis.json')) next = 'failure-analysis';
  else next = 'complete';
  const files = ['impact-analysis.xlsx', 'e2e-simulation.xlsx', 'regression-test-pack.xlsx', 'test-results.xlsx', 'failure-analysis.xlsx'].filter(has);
  console.log(JSON.stringify({ runId, requirement: run.requirement, readRequirementFrom: run.requirementText, next, gates: g, deliverables: files }, null, 2));
} else if (cmd === 'gate') {
  if (!['analysis', 'e2e', 'testgen', 'failures'].includes(gate)) { console.error('gate must be analysis, e2e, testgen or failures (execution is recorded by approval-gate.mjs)'); process.exit(1); }
  const decision = arg('decision');
  if (!['yes', 'no'].includes(decision)) { console.error('--decision yes|no is required'); process.exit(1); }
  const scope = arg('scope');
  if (gate === 'e2e' && decision === 'yes' && !['impact', 'org'].includes(scope)) { console.error('--scope impact|org is required when approving the e2e gate'); process.exit(1); }
  const order = GATES;
  const dir = runDir();
  const runFile = path.join(dir, 'run.json');
  const run = readJson(runFile);
  const prev = order[order.indexOf(gate) - 1];
  if (prev && run.gates?.[prev]?.decision !== 'yes') { console.error(`Cannot record "${gate}" before "${prev}" has been approved.`); process.exit(2); }
  let by = arg('by');
  if (!by) { try { by = execSync('git config user.name', { encoding: 'utf8' }).trim(); } catch { /* ignore */ } }
  run.gates = { ...(run.gates || {}), [gate]: { decision, ...(gate === 'e2e' && decision === 'yes' ? { scope } : {}), by: by || 'unknown', at: new Date().toISOString() } };
  if (decision === 'no') run.status = `stopped_at_${gate}`;
  writeJson(runFile, run);
  console.log(JSON.stringify({ gate, ...run.gates[gate] }));
} else if (cmd === 'reopen') {
  const dir = runDir();
  const runFile = path.join(dir, 'run.json');
  const run = readJson(runFile);
  const declined = GATES.filter(k => run.gates?.[k]?.decision === 'no');
  for (const k of declined) delete run.gates[k];
  run.status = 'reopened';
  writeJson(runFile, run);
  console.log(JSON.stringify({ reopened: declined }));
} else if (cmd === 'reset-execution') {
  const dir = runDir();
  requireGate('execution', dir);
  const moved = ['results.json', 'raw-test-output.json', 'test-results.xlsx', 'failure-analysis.json', 'failure-analysis.xlsx', 'failure-report.md']
    .filter(f => fs.existsSync(path.join(dir, f)));
  let n = 1; while (fs.existsSync(path.join(dir, `attempt-${n}`))) n++;
  const target = path.join(dir, `attempt-${n}`);
  fs.mkdirSync(target);
  for (const f of moved) fs.renameSync(path.join(dir, f), path.join(target, f));
  const runFile = path.join(dir, 'run.json');
  const run = readJson(runFile);
  if (run.gates) delete run.gates.failures;
  run.status = 'approved';
  writeJson(runFile, run);
  console.log(JSON.stringify({ archivedTo: `attempt-${n}`, files: moved }));
} else if (cmd === 'check') {
  if (!GATES.includes(gate)) { console.error(`Unknown gate "${gate}"`); process.exit(1); }
  requireGate(gate);
  console.log(JSON.stringify({ ok: true, gate }));
} else {
  console.error('Usage: workflow.mjs status | gate <name> --decision yes|no [--by Name] | check <name> | reopen | reset-execution'); process.exit(1);
}
