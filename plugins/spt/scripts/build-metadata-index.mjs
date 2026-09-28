#!/usr/bin/env node
// Builds a dependency index of local Salesforce source metadata.
// Usage: node build-metadata-index.mjs [--path force-app/main/default]
// Output: .spt/index/metadata-index.json
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, INDEX_FILE, loadConfig, walk, writeJson, tag, tags, blocks, arg } from './lib/common.mjs';

const cfg = loadConfig() || {};
const roots = arg('path') ? [arg('path')] : (cfg.metadataPaths || ['force-app/main/default']);

const components = [];
const objects = new Set();
const fields = new Map(); // "Obj.Field" -> {type, formula, referenceTo}

const rel = p => path.relative(PROJECT_ROOT, p).split(path.sep).join('/');

// Pass 1: objects and fields (needed to recognise references in pass 2)
for (const root of roots) {
  for (const file of walk(path.join(PROJECT_ROOT, root))) {
    const n = file.split(path.sep).join('/');
    let m;
    if ((m = n.match(/\/objects\/([^/]+)\/\1\.object-meta\.xml$/))) objects.add(m[1]);
    if ((m = n.match(/\/objects\/([^/]+)\/fields\/([^/]+)\.field-meta\.xml$/))) {
      objects.add(m[1]);
      const xml = fs.readFileSync(file, 'utf8');
      const key = `${m[1]}.${m[2]}`;
      fields.set(key, { type: tag(xml, 'type'), formula: tag(xml, 'formula'), referenceTo: tag(xml, 'referenceTo'), required: tag(xml, 'required') === 'true' });
      components.push({ key: `CustomField:${key}`, type: 'CustomField', name: key, object: m[1], path: rel(file),
        meta: fields.get(key), refs: refsIn(tag(xml, 'formula') || '', m[1]) });
    }
  }
}

function refsIn(text, contextObject = null) {
  const foundObjects = new Set();
  const foundFields = new Set();
  if (!text) return { objects: [], fields: [] };
  for (const o of objects) if (new RegExp(`\\b${escape(o)}\\b`).test(text)) foundObjects.add(o);
  // Objects a snippet is "about" even without an explicit contextObject arg (e.g. an Apex
  // class with no single owning object): any object name literally present in the source
  // (SOQL FROM, List<Obj>, new Obj(), Schema.Obj, etc.) counts as in-scope for bare/dot-qualified
  // field matching below.
  const contextObjects = new Set(foundObjects);
  if (contextObject) contextObjects.add(contextObject);
  for (const f of fields.keys()) {
    const [o, fld] = f.split('.');
    if (new RegExp(`\\b${escape(o)}\\.${escape(fld)}\\b`).test(text)) foundFields.add(f);
    else if (contextObjects.has(o) && (
      new RegExp(`(?<![\\w.])${escape(fld)}\\b`).test(text) || // bare: formulas, Flow <field>Name__c</field>
      new RegExp(`\\.${escape(fld)}\\b`).test(text)             // dot-qualified: opp.Discount__c, Trigger.new[0].Discount__c
    )) foundFields.add(f);
  }
  // Standard field references written as Object.Field (e.g. Opportunity.StageName)
  for (const mm of text.matchAll(/\b([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Za-z0-9_]*)\b/g)) {
    if (objects.has(mm[1]) && !mm[2].endsWith('__c')) foundFields.add(`${mm[1]}.${mm[2]}`);
  }
  return { objects: [...foundObjects], fields: [...foundFields] };
}
function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Fields a snippet writes to (assignment, not comparison) among the objects it's in scope for.
// Lets Apex classes/triggers feed the depth>1 blast-radius traversal the same way Flow recordUpdates do.
function writesIn(text, contextObjectsArr) {
  const contextObjects = new Set(contextObjectsArr);
  const writes = new Set();
  for (const f of fields.keys()) {
    const [o, fld] = f.split('.');
    if (!contextObjects.has(o)) continue;
    if (new RegExp(`\\.${escape(fld)}\\s*=(?!=)`).test(text) || new RegExp(`(?<![\\w.])${escape(fld)}\\s*=(?!=)`).test(text)) writes.add(f);
  }
  return [...writes];
}

// Pass 2: automation and other components
for (const root of roots) {
  for (const file of walk(path.join(PROJECT_ROOT, root))) {
    const n = file.split(path.sep).join('/');
    let m;
    const read = () => fs.readFileSync(file, 'utf8');

    if ((m = n.match(/\/objects\/([^/]+)\/validationRules\/([^/]+)\.validationRule-meta\.xml$/))) {
      const xml = read();
      const formula = tag(xml, 'errorConditionFormula') || '';
      components.push({ key: `ValidationRule:${m[1]}.${m[2]}`, type: 'ValidationRule', name: `${m[1]}.${m[2]}`, object: m[1], path: rel(file),
        active: tag(xml, 'active') === 'true', meta: { errorMessage: tag(xml, 'errorMessage'), formula }, refs: refsIn(formula, m[1]) });
    } else if ((m = n.match(/\/flows\/([^/]+)\.flow-meta\.xml$/))) {
      const xml = read();
      const start = tag(xml, 'start') || '';
      const object = tag(start, 'object');
      const writes = new Set();
      for (const blockName of ['recordUpdates', 'recordCreates']) {
        for (const b of blocks(xml, blockName)) {
          const target = tag(b, 'object') || (/\$Record/.test(tag(b, 'inputReference') || '') ? object : null);
          for (const f of tags(b, 'field')) if (target) writes.add(`${target}.${f}`);
        }
      }
      for (const a of blocks(xml, 'assignmentItems')) {
        const ref = tag(a, 'assignToReference') || '';
        const mm = ref.match(/^\$Record\.([A-Za-z0-9_]+)$/);
        if (mm && object) writes.add(`${object}.${mm[1]}`);
      }
      const refs = refsIn(xml, object);
      for (const mm of xml.matchAll(/\$Record(?:__Prior)?\.([A-Za-z0-9_]+)/g)) if (object) refs.fields.push(`${object}.${mm[1]}`);
      for (const f of tags(xml, 'field')) if (object && !f.includes('.')) refs.fields.push(`${object}.${f}`);
      refs.fields = [...new Set(refs.fields)];
      if (object && !refs.objects.includes(object)) refs.objects.push(object);
      components.push({ key: `Flow:${m[1]}`, type: 'Flow', name: m[1], object, path: rel(file),
        active: (tag(xml, 'status') || '') === 'Active',
        meta: { processType: tag(xml, 'processType'), triggerType: tag(start, 'triggerType'), recordTriggerType: tag(start, 'recordTriggerType'), label: tag(xml, 'label') },
        refs, writes: [...writes] });
    } else if ((m = n.match(/\/triggers\/([^/]+)\.trigger$/))) {
      const src = read();
      const hdr = src.match(/trigger\s+\w+\s+on\s+(\w+)\s*\(([^)]*)\)/i);
      const triggerObject = hdr ? hdr[1] : null;
      const refs = refsIn(src, triggerObject);
      components.push({ key: `ApexTrigger:${m[1]}`, type: 'ApexTrigger', name: m[1], object: triggerObject, path: rel(file), active: true,
        meta: { events: hdr ? hdr[2].replace(/\s+/g, ' ').trim() : null }, refs, writes: writesIn(src, refs.objects) });
    } else if ((m = n.match(/\/classes\/([^/]+)\.cls$/))) {
      const src = read();
      const refs = refsIn(src);
      components.push({ key: `ApexClass:${m[1]}`, type: 'ApexClass', name: m[1], path: rel(file), active: true,
        meta: { isTest: /@isTest/i.test(src) }, refs, writes: writesIn(src, refs.objects) });
    } else if ((m = n.match(/\/layouts\/([^/]+)\.layout-meta\.xml$/))) {
      const xml = read(); const obj = m[1].split('-')[0];
      components.push({ key: `Layout:${m[1]}`, type: 'Layout', name: m[1], object: obj, path: rel(file),
        refs: { objects: [obj], fields: tags(xml, 'field').map(f => `${obj}.${f}`) } });
    } else if ((m = n.match(/\/(permissionsets|profiles)\/([^/]+)\.(permissionset|profile)-meta\.xml$/))) {
      const xml = read();
      components.push({ key: `${m[1] === 'profiles' ? 'Profile' : 'PermissionSet'}:${m[2]}`, type: m[1] === 'profiles' ? 'Profile' : 'PermissionSet', name: m[2], path: rel(file),
        refs: { objects: tags(xml, 'object'), fields: tags(xml, 'field') } });
    } else if ((m = n.match(/\/(lwc|aura)\/([^/]+)\/[^/]+\.(js|html|cmp)$/))) {
      const src = read();
      const key = `${m[1] === 'lwc' ? 'LightningComponent' : 'AuraComponent'}:${m[2]}`;
      const existing = components.find(c => c.key === key);
      const r = refsIn(src);
      if (existing) { existing.refs.objects = [...new Set([...existing.refs.objects, ...r.objects])]; existing.refs.fields = [...new Set([...existing.refs.fields, ...r.fields])]; }
      else components.push({ key, type: key.split(':')[0], name: m[2], path: rel(path.dirname(file)), refs: r });
    } else if ((m = n.match(/\/(workflows|approvalProcesses|assignmentRules|duplicateRules|sharingRules|quickActions|flexipages|reportTypes|customMetadata)\/([^/]+)\.[a-zA-Z]+-meta\.xml$/))) {
      const xml = read();
      components.push({ key: `${m[1]}:${m[2]}`, type: m[1], name: m[2], path: rel(file), refs: refsIn(xml) });
    }
  }
}

const index = {
  generatedAt: new Date().toISOString(),
  roots,
  stats: components.reduce((a, c) => (a[c.type] = (a[c.type] || 0) + 1, a), {}),
  objects: [...objects].sort(),
  components
};
writeJson(INDEX_FILE, index);
console.log(JSON.stringify({ indexFile: path.relative(PROJECT_ROOT, INDEX_FILE), objects: index.objects.length, components: components.length, stats: index.stats }, null, 2));
