# Architecture

## Design principle: one guided skill, deterministic scripts, reasoning agents, human gates
| Concern | Done by | Why |
|---|---|---|
| Workflow order and the questions asked | `start` skill (`/spt:start`) | One entry point; the user never has to remember commands |
| Recording approvals, refusing out-of-order steps | `workflow.mjs`, `approval-gate.mjs`, `requireGate()` in every stage script | Gates hold even if the model tries to skip ahead |
| Audit of every question and answer | `record-decision.mjs` hook (PostToolUse on AskUserQuestion) | Captured by Claude Code, not written by the model |
| Protecting approval state | `guard-files.mjs` hook (PreToolUse on Write/Edit) | The model cannot edit `run.json` / `approved-scenarios.json` directly |
| Parse metadata, build dependency graph, traverse | `build-metadata-index.mjs`, `blast-radius.mjs` | Fast, repeatable, no token cost |
| Map business language to API names, verify dependencies, order-of-execution reasoning | `blast-radius-analyst` agent + `sf-metadata-analysis` skill | Needs judgement; the scripts are regex-based |
| Test case design | `test-designer` agent + `regression-scenario-design` skill | Judgement, domain heuristics |
| Execution | `apex-test-author` agent + `sf` CLI | Real org automation (flows, triggers, VRs) runs inside Apex tests |
| Result parsing | `parse-results.mjs` | Deterministic mapping via the `SC_###` method prefix |
| Diagnosis and recommendations | `failure-analyst` agent + `sf-remediation` skill | Judgement |
| E2E Test Case Simulation | `e2e-simulator` agent (traces business flows through the metadata in order of execution; nothing runs in the org) | Judgement |
| Excel deliverables | `export-xlsx.mjs` (zero-dependency writer in `lib/xlsx.mjs`) | Same layout every run |

## Stages and gates
| # | Stage | Gate (recorded in `run.json.gates`) | Deliverable |
|---|---|---|---|
| 1 | Upload requirement | – | `requirement.*` |
| 2 | Approval to analyse | `analysis` | – |
| 3 | Impact analysis | – | `impact-analysis.xlsx` |
| 4 | E2E Test Case Simulation | `e2e` with `scope: impact` (impacted areas and blast radius) or `org` (overall org metadata); `e2e-simulator` agent | `e2e-simulation.xlsx` |
| 5 | Test cases & Regression Test Pack | `testgen` (also locks the analysis via `finalize-blast-radius.mjs`) | `regression-test-pack.xlsx` |
| 6 | Approval before execution | `execution` (`approval-gate.mjs freeze` / `reject`) | `approved-scenarios.json` |
| 7 | Execution results | – | `test-results.xlsx` |
| 8 | Failure analysis & recommendations | `failures` | `failure-analysis.xlsx` |

A gate can only be approved after the previous one. A "no" stops the run (`status: stopped_at_<gate>`). `workflow.mjs status` returns the next stage, which lets `/spt:start` resume a run. `workflow.mjs reset-execution` archives the last execution to `attempt-<n>/` for a re-run.

## Repository layout
```
spt-regression-plugin/
├── .claude-plugin/marketplace.json      # makes this repo installable as a marketplace
├── plugins/spt/
│   ├── .claude-plugin/plugin.json
│   ├── skills/          start (the guided workflow), sf-metadata-analysis, regression-scenario-design,
│   │                    sf-remediation, salesforce-knowledge-layers
│   ├── agents/          blast-radius-analyst, test-designer, apex-test-author, failure-analyst
│   ├── hooks/hooks.json org guard (Bash), approval-file guard (Write/Edit), decision audit (AskUserQuestion)
│   ├── scripts/         Node 18+, zero dependencies
│   └── templates/       spt.config.json, org-knowledge.md, requirement template, scenario schema
├── examples/requirements/
└── docs/
```

## Why Apex tests (and what they can't cover)
Apex tests in a sandbox execute the org's real flows, triggers, validation rules, roll-ups and sharing, which covers most of a typical blast radius. They cannot assert UI (layouts, LWC rendering, Lightning pages), email content, or receipt by external systems. Those test cases are generated with `executionMode: "manual"` and appear as a checklist in `test-results.xlsx`. UI automation (e.g. Playwright or Provar) can be added later as a second executor.

## Knowledge layers
Global Salesforce rules live in the plugin skills and are the same for every client. Org-specific behaviour lives in the client repo's `spt-org-knowledge.md` and is never written into the plugin. Precedence: metadata > org knowledge > global rule > assumption. See the `salesforce-knowledge-layers` skill.
