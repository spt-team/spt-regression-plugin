#!/usr/bin/env node
// Creates a new run folder and copies the requirement into it (.docx is also converted to requirement.extracted.md).
// Usage: node start-run.mjs --requirement path/to/req.(md|txt|pdf|docx) [--name short-slug]
import fs from 'node:fs';
import path from 'node:path';
import { RUNS_DIR, CURRENT_FILE, PROJECT_ROOT, arg, writeJson } from './lib/common.mjs';
import { docxToMarkdown } from './lib/docx.mjs';

const req = arg('requirement');
if (!req || !fs.existsSync(path.resolve(PROJECT_ROOT, req))) { console.error(`Requirement file not found: ${req}`); process.exit(1); }
const ext = path.extname(req).toLowerCase();
if (!['.md', '.txt', '.pdf', '.docx'].includes(ext)) { console.error(`Unsupported requirement format "${ext}". Use .md, .txt, .pdf or .docx.`); process.exit(1); }
const slug = (arg('name') || path.basename(req).replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const runId = `${stamp}-${slug}`;
const dir = path.join(RUNS_DIR, runId);
const src = path.resolve(PROJECT_ROOT, req);
let extracted = null;
if (ext === '.docx') {
  try { extracted = docxToMarkdown(src); } catch (e) { console.error(`Could not read .docx: ${e.message}. Save it as PDF or Markdown and retry.`); process.exit(1); }
}
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, 'requirement' + ext));
let readFrom = 'requirement' + ext;
if (extracted) {
  fs.writeFileSync(path.join(dir, 'requirement.extracted.md'), extracted);
  readFrom = 'requirement.extracted.md';
}
writeJson(path.join(dir, 'run.json'), { runId, requirement: req, requirementText: readFrom, createdAt: new Date().toISOString(), status: 'analysing' });
fs.writeFileSync(CURRENT_FILE, runId);
console.log(JSON.stringify({ runId, dir: path.relative(PROJECT_ROOT, dir), readRequirementFrom: path.relative(PROJECT_ROOT, path.join(dir, readFrom)) }));
