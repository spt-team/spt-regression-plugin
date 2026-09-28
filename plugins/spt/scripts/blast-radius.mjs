#!/usr/bin/env node
// Deterministic blast-radius traversal over the metadata index.
// Usage: node blast-radius.mjs --seed Opportunity --seed OpportunityLineItem.Product2Id [--seed Flow:My_Flow] [--depth 2]
// Seeds: an object (Account), a field (Account.Rating__c) or a component key (Flow:X, ApexClass:Y).
// Output: <run>/blast-radius.raw.json  (the analyst agent turns this into the final report)
import path from 'node:path';
import fs from 'node:fs';
import { INDEX_FILE, loadConfig, readJson, writeJson, runDir, args, arg, requireGate } from './lib/common.mjs';

requireGate('analysis');

if (!fs.existsSync(INDEX_FILE)) { console.error('Metadata index missing. Run build-metadata-index.mjs first.'); process.exit(1); }
const cfg = loadConfig() || {};
const index = readJson(INDEX_FILE);
const maxDepth = Number(arg('depth', cfg.blastRadius?.maxDepth ?? 2));
const includeInactive = cfg.blastRadius?.includeInactive ?? false;
const exclude = new Set(cfg.blastRadius?.excludeComponents || []);
const seeds = args('seed');
if (!seeds.length) { console.error('Provide at least one --seed'); process.exit(1); }

const byKey = new Map(index.components.map(c => [c.key, c]));
const hitObjects = new Set(), hitFields = new Set();
for (const s of seeds) {
  if (s.includes(':')) {
    const c = byKey.get(s);
    if (c) { (c.writes || []).forEach(f => hitFields.add(f)); if (c.object) hitObjects.add(c.object); }
  } else if (s.includes('.')) { hitFields.add(s); hitObjects.add(s.split('.')[0]); }
  else hitObjects.add(s);
}

const impacted = new Map(); // key -> {component, depth, reasons[]}
function add(c, depth, reason) {
  if (exclude.has(c.key)) return false;
  if (c.active === false && !includeInactive) return false;
  if (c.meta?.isTest) return false;
  const e = impacted.get(c.key);
  if (e) { if (!e.reasons.includes(reason)) e.reasons.push(reason); return false; }
  impacted.set(c.key, { component: c, depth, reasons: [reason] });
  return true;
}

let frontierFields = new Set(hitFields), frontierObjects = new Set(hitObjects);
for (let depth = 1; depth <= maxDepth; depth++) {
  const nextFields = new Set();
  for (const c of index.components) {
    const fieldHits = c.refs.fields.filter(f => frontierFields.has(f));
    const objectHit = (c.object && frontierObjects.has(c.object)) || c.refs.objects.some(o => frontierObjects.has(o));
    let reason = null;
    if (fieldHits.length) reason = `references ${fieldHits.join(', ')}`;
    else if (objectHit && depth === 1 && ['Flow', 'ApexTrigger', 'ValidationRule', 'workflows', 'duplicateRules', 'assignmentRules', 'approvalProcesses'].includes(c.type) && frontierObjects.has(c.object))
      reason = `runs on ${c.object}`;
    else if (objectHit && depth === 1) reason = `references object ${c.refs.objects.find(o => frontierObjects.has(o)) || c.object}`;
    if (!reason) continue;
    const isNew = add(c, depth, reason);
    if (isNew) (c.writes || []).forEach(f => { if (!hitFields.has(f)) { nextFields.add(f); hitFields.add(f); } });
  }
  if (!nextFields.size) break;
  frontierFields = nextFields;
  frontierObjects = new Set([...nextFields].map(f => f.split('.')[0]));
}

function risk(e) {
  const c = e.component; let score = 0;
  if (e.depth === 1) score += 3; else score += 1;
  if (['Flow', 'ApexTrigger', 'ValidationRule'].includes(c.type)) score += 3;
  if (c.type === 'Flow' && c.meta?.processType === 'AutoLaunchedFlow' && c.meta?.triggerType) score += 1;
  if (c.type === 'ApexClass' || c.type === 'CustomField') score += 1;
  if (e.reasons.some(r => (r.startsWith('references ') && !r.includes('object')) || r.startsWith('runs on'))) score += 2;
  return score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low';
}

const items = [...impacted.values()].map(e => ({
  key: e.component.key, type: e.component.type, name: e.component.name, object: e.component.object || null,
  path: e.component.path, depth: e.depth, risk: risk(e), reasons: e.reasons,
  writes: e.component.writes || [], meta: e.component.meta || {}
})).sort((a, b) => ['High', 'Medium', 'Low'].indexOf(a.risk) - ['High', 'Medium', 'Low'].indexOf(b.risk) || a.depth - b.depth);

const out = {
  generatedAt: new Date().toISOString(), seeds, maxDepth,
  impactedObjects: [...hitObjects].sort(),
  impactedFields: [...hitFields].sort(),
  summary: items.reduce((a, i) => (a[i.type] = (a[i.type] || 0) + 1, a), {}),
  components: items
};
const target = path.join(runDir(), 'blast-radius.raw.json');
writeJson(target, out);
console.log(JSON.stringify({ written: target, objects: out.impactedObjects.length, fields: out.impactedFields.length, components: items.length, summary: out.summary }, null, 2));
