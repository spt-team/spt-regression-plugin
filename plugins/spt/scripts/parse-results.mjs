#!/usr/bin/env node
// Normalises Salesforce CLI JSON test output into <run>/results.json.
// Accepts output of `sf project deploy validate|start --json` or `sf apex run test --json`.
// Test methods must be named  SC_###_<description>  so results map back to scenarios.
// Usage: node parse-results.mjs [--input <run>/raw-test-output.json] [--org <alias>]
import fs from 'node:fs';
import path from 'node:path';
import { runDir, readJson, writeJson, arg } from './lib/common.mjs';

const dir = runDir();
const input = arg('input', path.join(dir, 'raw-test-output.json'));
const raw = readJson(input);
const result = raw.result || raw;
const approved = readJson(path.join(dir, 'approved-scenarios.json')).scenarios;

const tests = [];
const rtr = result.details?.runTestResult;
if (rtr) {
  const arr = x => (Array.isArray(x) ? x : x ? [x] : []);
  for (const s of arr(rtr.successes)) tests.push({ className: s.name, method: s.methodName, outcome: 'Pass', message: null, stackTrace: null });
  for (const f of arr(rtr.failures)) tests.push({ className: f.name, method: f.methodName, outcome: 'Fail', message: f.message, stackTrace: f.stackTrace });
}
for (const t of result.tests || []) {
  tests.push({ className: t.ApexClass?.Name || t.FullName?.split('.')[0], method: t.MethodName, outcome: t.Outcome === 'Pass' ? 'Pass' : 'Fail', message: t.Message || null, stackTrace: t.StackTrace || null });
}
const componentErrors = (Array.isArray(result.details?.componentFailures) ? result.details.componentFailures : result.details?.componentFailures ? [result.details.componentFailures] : [])
  .map(c => ({ component: c.fullName, type: c.componentType, problem: c.problem, line: c.lineNumber }));

const scenarioResults = approved.map(s => {
  const id = s.id.replace('-', '_');
  const t = tests.find(x => (x.method || '').startsWith(id));
  let status = s.executionMode === 'manual' ? 'Manual' : t ? t.outcome : componentErrors.length ? 'Error' : 'NotRun';
  return { id: s.id, title: s.title, priority: s.priority, executionMode: s.executionMode, status, test: t ? `${t.className}.${t.method}` : null,
    message: t?.message || (status === 'Error' ? 'Test class failed to compile/deploy - see componentErrors' : null), stackTrace: t?.stackTrace || null, components: s.components };
});

const summary = scenarioResults.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
writeJson(path.join(dir, 'results.json'), { parsedAt: new Date().toISOString(), summary, componentErrors, scenarios: scenarioResults });
const run = readJson(path.join(dir, 'run.json')); run.status = 'executed'; if (arg('org')) run.targetOrg = arg('org'); run.executedAt = new Date().toISOString(); writeJson(path.join(dir, 'run.json'), run);
console.log(JSON.stringify({ summary, componentErrors: componentErrors.length }, null, 2));
