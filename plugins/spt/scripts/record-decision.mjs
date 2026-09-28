#!/usr/bin/env node
// PostToolUse hook (matcher: AskUserQuestion). Appends the raw question and the user's answer,
// as captured by Claude Code, to the current run's decisions.log.jsonl as an audit trail of every gate.
import fs from 'node:fs';
import path from 'node:path';
import { currentRunId, RUNS_DIR } from './lib/common.mjs';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8').trim());
  const runId = currentRunId();
  const dir = runId && path.join(RUNS_DIR, runId);
  if (dir && fs.existsSync(dir)) {
    fs.appendFileSync(path.join(dir, 'decisions.log.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), question: input.tool_input, answer: input.tool_response }) + '\n');
  }
} catch { /* never block the conversation */ }
process.exit(0);
