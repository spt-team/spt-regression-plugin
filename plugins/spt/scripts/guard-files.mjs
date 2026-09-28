#!/usr/bin/env node
// PreToolUse hook (matcher: Write|Edit|MultiEdit). Approval state is written only by the gate scripts
// after the user answers, never edited directly by the model.
import fs from 'node:fs';

let file = '';
try { file = JSON.parse(fs.readFileSync(0, 'utf8').trim())?.tool_input?.file_path || ''; } catch { process.exit(0); }
const n = file.replace(/\\/g, '/');
if (/\/\.spt\/runs\/[^/]+\/(run\.json|approved-scenarios\.json|decisions\.log\.jsonl)$/.test(n)) {
  process.stderr.write('SPT guard: run.json, approved-scenarios.json and decisions.log.jsonl record human approvals and can only be changed by the SPT gate scripts after the user answers.\n');
  process.exit(2);
}
process.exit(0);
