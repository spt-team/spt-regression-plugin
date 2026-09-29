#!/usr/bin/env node
// Workflow state and human-approval gates for the guided /spt:start flow.
//   status                                    -> current run, stage reached, next stage, recorded decisions
//   gate <analysis|questions|e2e|testgen|failures> --decision yes|no [--scope impact|org] [--by "Name"]
//                                             "analysis" also takes --decision skip: no blast radius analysis, go straight to the test cases
//                                             --scope is required for "e2e" yes: impact = impacted areas and blast radius, org = overall org metadata
//                                             "questions" no = continue without answering the open questions; it does not stop the run
//   check <analysis|questions|e2e|testgen|execution|failures>   exit 0 only if the user approved that gate
//   reopen                                    clear a declined ("no") gate so the question can be asked again
//   reset-execution                           archive the last execution (results, failure analysis) into attempt-<n>/ for a re-run
// The execution gate is recorded by approval-gate.mjs (freeze = yes, reject = no).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { currentRunId, runDir, readJson, writeJson, arg, requireGate, GATES, STOP_GATES, RUNS_DIR } from './lib/common.mjs';

const [cmd, gate] = process.argv.slice(2);

if (cmd === 'status') {
  const runId = currentRunId();
  if (!runId || !fs.existsSync(path.join(RUNS_DIR, runId, 'run.json'))) { console.log(JSON.stringify({ runId: null, next: 'upload' })); process.exit(0); }
  const dir = runDir(runId);
  const run = readJson(path.join(dir, 'run.json'));
  const has = f => fs.existsSync(path.join(dir, f));
  const g = run.gates || {};
  const stopped = STOP_GATES.find(k => g[k]?.decision === 'no');
  // The stages from test generation on are the same whether or not the analysis was skipped.
  const fromTestgen = () => !g.testgen ? 'ask-testgen'
    : !has('scenarios.json') ? 'generate-tests'
    : !g.execution ? 'ask-execution'
    : !has('results.json') ? 'execute'
    : !g.failures ? 'ask-failures'
    : !has('failure-analysis.json') ? 'failure-analysis'
    : 'complete';
  let next;
  if (stopped) next = `stopped (user declined ${stopped})`;
  else if (!g.analysis) next = 'ask-analysis';
  // The user chose to go straight to the test cases: no blast radius, no E2E test cases.
  else if (g.analysis.decision === 'skip') next = fromTestgen();
  else if (!has('blast-radius.json')) next = 'analyse';
  // Runs whose tests were generated before the questions/e2e gates existed (<= 0.4.0) skip them.
  else if (!g.questions && !g.e2e && !g.testgen) next = 'ask-questions';
  else if (!g.e2e && !g.testgen) next = 'ask-e2e';
  else if (g.e2e?.decision === 'yes' && !has('e2e-simulation.json')) next = 'simulate-e2e';
  else next = fromTestgen();
  const files = ['impact-analysis.xlsx', 'e2e-simulation.xlsx', 'regression-test-pack.xlsx', 'test-results.xlsx', 'failure-analysis.xlsx'].filter(has);
  console.log(JSON.stringify({ runId, requirement: run.requirement, readRequirementFrom: run.requirementText, next, gates: g, deliverables: files }, null, 2));
} else if (cmd === 'gate') {
  if (!['analysis', 'questions', 'e2e', 'testgen', 'failures'].includes(gate)) { console.error('gate must be analysis, questions, e2e, testgen or failures (execution is recorded by approval-gate.mjs)'); process.exit(1); }
  const decision = arg('decision');
  const allowed = gate === 'analysis' ? ['yes', 'skip', 'no'] : ['yes', 'no'];
  if (!allowed.includes(decision)) { console.error(`--decision ${allowed.join('|')} is required`); process.exit(1); }
  const scope = arg('scope');
  if (gate === 'e2e' && decision === 'yes' && !['impact', 'org'].includes(scope)) { console.error('--scope impact|org is required when approving the e2e gate'); process.exit(1); }
  const dir = runDir();
  const runFile = path.join(dir, 'run.json');
  const run = readJson(runFile);
  // A gate can only be answered once the stages before it are done. The analysis gate has two
  // "go on" answers: yes (analyse first) and skip (straight to the test cases from the document).
  const g = run.gates || {};
  const ready = {
    analysis: () => true,
    questions: () => g.analysis?.decision === 'yes',
    e2e: () => g.analysis?.decision === 'yes',
    testgen: () => g.analysis?.decision === 'skip' || (g.analysis?.decision === 'yes' && !!g.e2e),
    failures: () => g.execution?.decision === 'yes',
  };
  if (!ready[gate]()) { console.error(`Cannot record "${gate}" yet: the stages before it have not been approved.`); process.exit(2); }
  let by = arg('by');
  if (!by) { try { by = execSync('git config user.name', { encoding: 'utf8' }).trim(); } catch { /* ignore */ } }
  run.gates = { ...g, [gate]: { decision, ...(gate === 'e2e' && decision === 'yes' ? { scope } : {}), by: by || 'unknown', at: new Date().toISOString() } };
  if (decision === 'skip') run.status = 'analysis_skipped';
  else if (decision === 'no' && STOP_GATES.includes(gate)) run.status = `stopped_at_${gate}`;
  writeJson(runFile, run);
  console.log(JSON.stringify({ gate, ...run.gates[gate] }));
} else if (cmd === 'reopen') {
  const dir = runDir();
  const runFile = path.join(dir, 'run.json');
  const run = readJson(runFile);
  const declined = STOP_GATES.filter(k => run.gates?.[k]?.decision === 'no');
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
  console.error('Usage: workflow.mjs status | gate <name> --decision yes|no|skip [--scope impact|org] [--by Name] | check <name> | reopen | reset-execution'); process.exit(1);
}
