# Changelog
## 0.4.0
- **New Stage 4: End-to-End (E2E) Test Case Simulation.** After the impact analysis is shown, `/spt:start` explains what the simulation is and asks: **"3. Do you want to proceed with the End-to-End (E2E) Test Case Simulation?"** The options are *Yes, impacted areas only* (recommended), *Yes, overall org metadata*, and *No, stop here*.
- The new `e2e-simulator` agent traces complete business flows step by step through the local metadata, in Salesforce order of execution, and predicts each step as Pass / At risk / Fail. It writes `e2e-simulation.json` / `.md`, and `export-xlsx.mjs e2e` writes `e2e-simulation.xlsx` (Summary, E2E Flows, Simulation Steps, Predicted Issues, Test Data, Coverage, Assumptions & Limits). It is a simulation only: no records are created and nothing runs in any org. The file location is shown the same way as for the impact analysis.
- New gate `e2e` (`workflow.mjs gate e2e --decision yes --scope impact|org`), between `analysis` and `testgen`. `status` returns `ask-e2e` / `simulate-e2e`. Runs that were already past test generation before this version skip the new stage.
- The test designer turns every simulated E2E flow, and every predicted issue, into test cases (new scenario category `e2e`).
- The later stages are renumbered 5–8. They are otherwise unchanged.
- `docs/SPT-Plugin-User-Guide.docx` is rewritten for the guided `/spt:start` workflow (it previously described the 0.2.0 commands). It shows every question as the plugin asks it, where each Excel deliverable is, and the new E2E simulation stage.

## 0.3.1
- **Impact analysis file handoff.** When Stage 3 finishes, `/spt:start` first tells the user where the impact analysis is: a clickable link to `impact-analysis.xlsx`, the `blast-radius.md` report, the run folder, the full path on disk, and the sheets in the workbook. The detailed summary follows. The block is shown again whenever the analysis is updated.
- `export-xlsx.mjs` now also prints `folder` and `absolutePath` (and `written` uses forward slashes so links work on Windows).
- No change to the workflow: same stages, same questions, same approval gates.

## 0.3.0
- **One guided, skill-based workflow.** `/spt:start` replaces the ten separate commands and walks the user through seven stages: upload requirement, approval to analyse, impact analysis, test cases and Regression Test Pack, approval before execution, execution results, failure analysis and recommendations. It resumes a stopped run, and offers to re-run the approved tests after a fix.
- **Human approval at every critical stage.** Gates `analysis`, `testgen`, `execution` and `failures` are asked with Yes/No buttons, recorded in `run.json` by `workflow.mjs` / `approval-gate.mjs`, and enforced by the stage scripts (`blast-radius.mjs`, `finalize-blast-radius.mjs`, `approval-gate.mjs`). A "No" stops the workflow.
- **Excel deliverables** (`export-xlsx.mjs`, zero dependencies): `impact-analysis.xlsx`, `regression-test-pack.xlsx`, `test-results.xlsx`, `failure-analysis.xlsx`. The blast-radius analyst now also outputs dependencies, risks and overall risk; the failure analyst outputs `failure-analysis.json`.
- New hooks: `record-decision.mjs` logs every question and answer to `decisions.log.jsonl`; `guard-files.mjs` blocks direct edits to approval state.
- `approval-gate.mjs` gains `freeze --all` and `reject`; `workflow.mjs reset-execution` archives previous results to `attempt-<n>/`.
- Removed commands: init, analyze, finalize, generate, approve, run, report, status, full, learn. Their behaviour now lives in the `start` skill.

## 0.2.0
- Workflow is now three explicit steps. Every command description is labelled `[Step 1 of 3]`, `[Step 2 of 3]`, `[Step 3 of 3]`, `[Setup]`, `[Knowledge]` or `[Utility]`.
- New `/spt:finalize` (end of Step 1): the reviewer adds, removes or re-rates components and answers open questions, then the blast radius is hash-locked. `/spt:generate` now requires a finalised blast radius, and an approval becomes invalid if the blast radius is re-finalised.
- Org-specific knowledge layer: new `spt-org-knowledge.md` (created by `/spt:init`, path set by `orgKnowledgeFile`) holds client-specific behaviour. The new `salesforce-knowledge-layers` skill separates global Salesforce rules from org-specific facts, and every component and diagnosis carries a `basis` tag. Agents write `org-knowledge-proposals.md` per run; the new `/spt:learn` (human-only) merges accepted proposals into the org knowledge file.
- `.docx` requirements are supported (zero-dependency extraction to `requirement.extracted.md`).

## 0.1.1
- Fix: `build-metadata-index.mjs` now resolves field references/writes in Apex classes and triggers accessed through a variable (`opp.Discount__c`, `Trigger.new[0].Discount__c`), not just literal `Object.Field` text. Previously Apex logic — where most blast-radius-relevant behaviour lives — only ever registered as a generic "references object X", and never contributed to depth>1 traversal via `blast-radius.mjs` because it had no `writes`. Apex components now populate `writes` the same way Flows do, so a field an Apex class assigns correctly seeds the next traversal depth.

## 0.1.0
- Initial scaffold: blast radius, scenario generation, approval gate, sandbox execution (validate mode), failure analysis.
