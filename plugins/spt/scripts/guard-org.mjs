#!/usr/bin/env node
// Claude Code PreToolUse hook (matcher: Bash).
// Blocks Salesforce CLI commands that write to or execute in an org unless:
//   1. the target org is listed in spt.config.json allowedOrgs and does not match blockedOrgPatterns
//   2. for test execution / deploys of SPT tests, the current run has a valid human approval
// Exit code 2 blocks the tool call and shows stderr to Claude. Exit 0 allows.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, currentRunId, RUNS_DIR, readJson, sha256 } from './lib/common.mjs';

let input = '';
try { input = fs.readFileSync(0, 'utf8').trim(); } catch { process.exit(0); }
let command = '';
try { command = JSON.parse(input)?.tool_input?.command || ''; } catch { process.exit(0); }

const isSf = /\b(sf|sfdx)\s/.test(command);
if (!isSf) process.exit(0);

const writes = /\b(sf|sfdx)\s+(project\s+deploy|apex\s+run|data\s+(create|update|delete|upsert|import)|force:source:deploy|force:apex:test:run|force:apex:execute|force:data)/.test(command);
if (!writes) process.exit(0);

const cfg = loadConfig();
if (!cfg) process.exit(0); // not an SPT project; stay out of the way

const orgMatch = command.match(/(?:--target-org|-o|-u|--targetusername)[\s=]+("?)([^\s"]+)\1/);
const org = orgMatch ? orgMatch[2] : null;
const block = msg => { process.stderr.write(`SPT guard: ${msg}\n`); process.exit(2); };

if (!org) block('Salesforce write/execute commands must pass --target-org explicitly (default orgs are not trusted).');
if ((cfg.blockedOrgPatterns || []).some(p => org.toLowerCase().includes(p.toLowerCase()))) block(`Org "${org}" matches a blocked pattern. SPT never runs against production.`);
if (!(cfg.allowedOrgs || []).includes(org)) block(`Org "${org}" is not in spt.config.json allowedOrgs. Add it (sandbox only) or use an allowed org.`);

const touchesSptTests = command.includes(cfg.testSourceDir || 'spt-tests') || /SPT_\w*Test/.test(command) || /apex\s+run\s+test/.test(command);
if (touchesSptTests) {
  const runId = currentRunId();
  const f = runId && path.join(RUNS_DIR, runId, 'approved-scenarios.json');
  if (!f || !fs.existsSync(f)) block('No human approval for the current run. The user must approve test execution in the /spt:start workflow before tests can run.');
  const rec = readJson(f);
  const hash = sha256(JSON.stringify(rec.scenarios.map(({ testMethod, ...s }) => s)));
  if (rec.status !== 'approved' || hash !== rec.hash) block('Approved test cases changed after approval. Ask the user to approve again in /spt:start.');
}
process.exit(0);
