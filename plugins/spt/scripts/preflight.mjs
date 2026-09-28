#!/usr/bin/env node
// Environment checks used by the /spt:start workflow before test execution.
// Usage: node preflight.mjs [--org <alias>]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, loadConfig, arg } from './lib/common.mjs';

const checks = [];
const run = c => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return null; } };
const add = (name, ok, detail) => checks.push({ name, ok, detail });

add('Node >= 18', Number(process.versions.node.split('.')[0]) >= 18, process.versions.node);
const sfv = run('sf --version'); add('Salesforce CLI (sf)', !!sfv, sfv?.trim() || 'Install: https://developer.salesforce.com/tools/salesforcecli');
add('sfdx-project.json', fs.existsSync(path.join(PROJECT_ROOT, 'sfdx-project.json')), PROJECT_ROOT);
const cfg = loadConfig(); add('spt.config.json', !!cfg, cfg ? 'found' : 'run /spt:start (it sets up the project)');
if (cfg) for (const p of cfg.metadataPaths) add(`metadata path ${p}`, fs.existsSync(path.join(PROJECT_ROOT, p)), '');

const org = arg('org');
if (org) {
  const q = run(`sf data query --query "SELECT IsSandbox, Name FROM Organization" --target-org ${org} --json`);
  let isSandbox = null, name = null;
  try { const r = JSON.parse(q).result.records[0]; isSandbox = r.IsSandbox; name = r.Name; } catch { /* ignore */ }
  add(`org ${org} reachable`, isSandbox !== null, name || 'Authorise with: sf org login web --alias ' + org);
  add(`org ${org} is a sandbox`, isSandbox === true, isSandbox === false ? 'PRODUCTION ORG - SPT will not run here' : '');
}
console.log(JSON.stringify({ ok: checks.every(c => c.ok), checks }, null, 2));
process.exit(checks.every(c => c.ok) ? 0 : 1);
