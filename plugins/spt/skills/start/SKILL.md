---
name: start
description: SPT guided Salesforce regression testing workflow. Upload a requirement, choose between a blast radius analysis against the local Salesforce metadata and going straight to the test cases, answer the open questions the analysis raises, create the End-to-End (E2E) test cases for the impacted areas or the overall org metadata, generate test cases and a Regression Test Pack, approve and run the tests in a sandbox, then review failure analysis and recommendations, with human approval at every stage. Use when the user wants to start, continue or resume SPT regression testing, test a requirement, or run a regression pack.
argument-hint: "[path-to-requirement]"
allowed-tools: Bash(node:*), Bash(sf:*), Read, Write, Edit, Grep, Glob, Agent, Task, AskUserQuestion
---

# SPT guided regression workflow

You run a fixed eight-stage workflow. Scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts/`; write `S` below for that folder. Run folder = `.spt/runs/<runId>/`.

## Rules (apply to every stage)
1. **Follow the stages in order. Never skip one, never run two approval-controlled stages without asking in between, and never answer a gate question on the user's behalf**, even if they say "do everything" or "don't ask again". If the user asks to skip ahead, explain that the workflow requires their approval and ask the gate question.
2. **Ask gate questions with the AskUserQuestion tool**, using the exact wording given below, a two-option Yes/No choice (Yes first, except where a stage lists more options), and header `SPT gate`. If AskUserQuestion is not available, ask the same question as plain text and wait; only an explicit yes counts.
3. **Record every gate decision right after the answer**, then act on it:
   `node "S/workflow.mjs" gate <analysis|questions|e2e|testgen|failures> --decision yes|no` (the `analysis` gate also takes `--decision skip`; the `e2e` gate also takes `--scope impact|org` on yes). The execution gate is recorded by `approval-gate.mjs` (Stage 6).
4. **"No" means stop.** Record it, confirm that nothing further was done, list the files produced so far, and say they can resume with `/spt:start`. Do not continue. Two answers are not a stop and are named as such in their stage: `skip` at the `analysis` gate (go straight to the test cases) and "No" at the `questions` gate (continue without answering the open questions).
5. Stay within this workflow. Do not modify the client's Salesforce code or metadata, and never run anything against a production org.
6. Tell the user where each deliverable is, using clickable relative links to the files in the run folder.

## Stage 0: prerequisites and resume (no questions unless needed)
1. If `spt.config.json` is missing in the project root, set up once, briefly telling the user you are doing so:
   - copy `${CLAUDE_PLUGIN_ROOT}/templates/spt.config.json` to the project root; set `metadataPaths` from `sfdx-project.json` packageDirectories (append `/main/default` where that folder exists);
   - add `{ "path": "spt-tests", "default": false }` to `sfdx-project.json` packageDirectories if missing and create `spt-tests/main/default/classes/`;
   - add `.spt/runs/*/raw-test-output.json` and `.spt/index/` to `.gitignore`;
   - if the org knowledge file (`orgKnowledgeFile`, default `spt-org-knowledge.md`) is missing, copy `${CLAUDE_PLUGIN_ROOT}/templates/org-knowledge.md`, pre-fill what the metadata clearly shows (trigger handler classes, a class named like `TestDataFactory`, custom permissions named like `Bypass*`), and mark those lines `(detected - please confirm)`.
   If `sfdx-project.json` does not exist, stop: SPT must be run from a Salesforce DX project with its metadata retrieved.
2. Run `node "S/workflow.mjs" status`.
   - `next` is anything other than `upload`, `complete` or `stopped ...`: ask with AskUserQuestion whether to **continue run <runId> (<requirement>)** from where it stopped, or **start with a new requirement**. Continue means jump to the stage that matches `next`: `ask-analysis`→Stage 2, `analyse`→Stage 3, `ask-questions`→Stage 3 step 6, `ask-e2e`→Stage 4, `simulate-e2e`→Stage 4 step 3, `ask-testgen`→Stage 5, `generate-tests`→Stage 5 step 2, `ask-execution`→Stage 6, `execute`→Stage 7, `ask-failures`→Stage 8 question, `failure-analysis`→Stage 8 step 2.
   - `next` is `complete` and the run has an approval: ask whether to **re-run the approved tests for run <runId>** (e.g. after a fix was deployed) or **start with a new requirement**. Re-run: `node "S/workflow.mjs" reset-execution`, then Stage 7. (Choosing re-run is the user's approval to execute the already-approved test cases.)
   - `next` is `stopped (user declined <gate>)`: ask whether to **reopen run <runId> and ask the <gate> question again**, or **start with a new requirement**. Reopen: `node "S/workflow.mjs" reopen`, then run `status` again and continue from its `next`.
   - Otherwise go to Stage 1.

## Stage 1: Upload requirement
If the user passed a file path with the command (`$ARGUMENTS`), treat it as the upload. Otherwise ask, as plain text:

**"1. Upload the Requirement?"**

Then add one line: they can attach the file (drag it in or use @), give its path, or paste the requirement text. Accepted: .docx, .pdf, .md, .txt. Wait for the answer.
- Pasted text: save it to `requirements/<short-slug>.md`, using the requirement's title for the slug.
- Then run `node "S/start-run.mjs" --requirement "<path>"` and read the requirement from the `readRequirementFrom` path it prints.
- Show a 3–5 line summary of what you understood (business need, what changes, acceptance criteria count).

## Stage 2: Blast Radius Analysis, or straight to the test cases
Ask this as soon as the requirement is uploaded and summarised. AskUserQuestion, header `SPT gate`, exact question:
**"2. Do you want to perform a Blast Radius Analysis, or proceed directly with the test cases based on the uploaded document?"**
Options, in this order, with these descriptions:
- `Yes, run the Blast Radius Analysis`: "Analyse the requirement against the local Salesforce metadata first, to identify the impacted areas and the blast radius. The test cases are then based on what the metadata shows. (Recommended)"
- `No, go straight to the test cases`: "Skip the impact analysis and the E2E test cases, and generate the Regression Test Pack from the uploaded document alone. Quicker, but the test cases are not backed by the metadata and coverage of impacted components cannot be shown."
- `No, stop here`: "Stop the workflow. Nothing is analysed, and you can resume later with /spt:start."

Record gate `analysis`: `--decision yes`, `--decision skip`, or `--decision no` (Rule 4).
On skip: say in one line that the impact analysis and the E2E test cases are skipped and the test cases will come from the requirement only, then go straight to **Stage 5**.

## Stage 3: Impact analysis → Excel
1. `node "S/build-metadata-index.mjs"`. If very few components are indexed, warn that the local metadata may be stale (suggest `sf project retrieve start --manifest manifest/package.xml --target-org <alias>`), but continue.
2. Delegate to the **blast-radius-analyst** agent with the run folder path. It must read the org knowledge file first and write `blast-radius.json` (including `dependencies`, `risks`, `affectedAreas`, `overallRisk`) and `blast-radius.md`.
3. `node "S/export-xlsx.mjs" impact` → `impact-analysis.xlsx`. Keep the `written`, `folder` and `absolutePath` values it prints.
4. **Tell the user where the impact analysis file is, before anything else**, so they can find it easily. Use this block, filling in the values from step 3 (links are workspace-relative, forward slashes):

   > **Your impact analysis is ready.**
   > - Impact analysis (Excel): [impact-analysis.xlsx](<written>)
   > - Blast radius report: [blast-radius.md](<folder>/blast-radius.md)
   > - Folder: `<folder>/`
   > - Full path: `<absolutePath>`
   >
   > The workbook has these sheets: Summary, Impacted Components, Dependencies, Objects & Fields, Affected Areas, Risks & Considerations, Assumptions & Questions, and Limitations. It opens in Excel. In VS Code, click the link or right-click the file and choose "Reveal in File Explorer".

   List Summary and Impacted Components, and only those other sheets that `export-xlsx.mjs` reported with a count above 0. Empty sheets are not written.
5. Then present: overall risk; counts by risk and component type; the High-risk components (type, API name, why); key dependencies; potentially affected areas; main risks and considerations; assumptions and open questions (blocking first).
6. **Open questions.** Once the Impact Analysis document has been generated and presented, AskUserQuestion, header `SPT gate`, exact question:
   **"Do you want to answer the blocking questions, or any other questions, before we proceed?"**
   Options: `Yes, let me answer them` / `No, continue without answering`. Record gate `questions`. A "No" here does **not** stop the workflow (it is the one exception to Rule 4): say the questions stay open and are carried into the analysis as assumptions, then go to Stage 4.
   - On yes: show the open questions from `blast-radius.json` `openQuestions[]` as plain text, numbered, **blocking ones first and labelled `(blocking)`**, each with one line of context explaining why it matters and what you will do with the answer. Add: they can answer all of them, answer only some, say "skip" for any question, and raise anything else about the analysis. Then wait.
   - When they answer, apply the answers as in step 7.
7. **Applying answers and review changes.** If the user answered questions, or asks to add, remove or re-rate components: move each answered question to `resolvedQuestions[]` with its answer and correct the components, risks and affected areas it changes, verify each added component exists locally (otherwise put it in `notAnalysable`), move removed ones to `removedByReviewer[]` with the reason, update both blast-radius files, re-run `export-xlsx.mjs impact`, and show the step 4 block again with the words "updated impact analysis". Then ask once whether they have anything else to answer or change, and repeat this step until they are done.

## Stage 4: End-to-End (E2E) Test Cases
Ask this once the open questions have been dealt with (Stage 3 step 6), whether they were answered or not.
1. First explain in plain text, in two short lines: *The E2E test cases walk through complete business processes (for example, create → update → approve → close) step by step against your local Salesforce metadata, and predict where each step would pass, be at risk, or fail. They are written from the metadata only: no records are created and nothing runs in any org.*
2. AskUserQuestion, header `SPT gate`, exact question:
   **"Can I create the End-to-End (E2E) Test Cases file?"**
   Options, in this order, with these descriptions:
   - `Yes, impacted areas only`: "Build the E2E test cases for the impacted areas and blast radius found in the impact analysis. Focused and quicker. (Recommended)"
   - `Yes, overall org metadata`: "Build the E2E test cases across the overall org metadata, including related processes outside the blast radius that share the same objects. Wider coverage; takes longer."
   - `No, stop here`: "Stop the workflow. The impact analysis is kept, and you can resume later with /spt:start."
   Record gate `e2e`: `--decision yes --scope impact`, `--decision yes --scope org`, or `--decision no` (Rule 4).
3. On yes: run `node "S/build-metadata-index.mjs"` only if `.spt/index/metadata-index.json` is missing, then delegate to the **e2e-simulator** agent with the run folder path. It analyses the overall requirement against the Salesforce metadata available locally in this workspace, and writes the complete E2E test cases for the identified impact areas to `e2e-simulation.json` and `e2e-simulation.md`, using the scope and the answered questions recorded in `run.json` and `blast-radius.json`.
4. `node "S/export-xlsx.mjs" e2e` → `e2e-simulation.xlsx`. Keep the `written`, `folder` and `absolutePath` values it prints.
5. **Tell the user where the E2E test cases file is, before anything else**, in the same format as Stage 3 step 4:

   > **Your End-to-End (E2E) Test Cases file is ready** (scope: impacted areas and blast radius | overall org metadata).
   > - E2E test cases (Excel): [e2e-simulation.xlsx](<written>)
   > - E2E test case report: [e2e-simulation.md](<folder>/e2e-simulation.md)
   > - Folder: `<folder>/`
   > - Full path: `<absolutePath>`
   >
   > The workbook has these sheets: Summary, E2E Flows, Simulation Steps, Predicted Issues, Test Data, Coverage, and Assumptions & Limits.

   List Summary, E2E Flows and Simulation Steps, and only those other sheets that were reported with a count above 0.
6. Then present: the number of E2E flows; a table of each flow (ID, name, predicted outcome Pass / At risk / Fail); every step predicted to **Fail** or be **At risk**, with its reason; the predicted issues with recommendations; and any High-risk component that no flow covers.

## Stage 5: Test cases and Regression Test Pack
1. AskUserQuestion, exact question:
   **"Based on the identified changes and impacts, can I generate the possible test cases and Regression Test Pack?"**
   Options: `Yes, generate the test cases` / `No, stop here`. Record gate `testgen`.
2. On yes: `node "S/finalize-blast-radius.mjs" finalise` (locks the analysis the tests are based on), then delegate to the **test-designer** agent. It also uses `e2e-simulation.json`, so every E2E flow becomes at least one `e2e` test case. It writes `scenarios.json` (valid against `${CLAUDE_PLUGIN_ROOT}/templates/scenario.schema.json`) and `scenarios.md` (each test case as an unticked `- [ ] **SC-###**` line).
   If the analysis was skipped at Stage 2, there is no `blast-radius.json` and no `e2e-simulation.json`: the test designer works from the requirement alone. Say so in one line, and tell the user the pack has no metadata-backed coverage figures.
3. `node "S/export-xlsx.mjs" testpack` → `regression-test-pack.xlsx`.
4. Present: number of test cases by priority, category and mode (apex = automated, manual = tester checklist); the coverage of High-risk components and of the E2E flows; anything not covered and why; links to `regression-test-pack.xlsx` and `scenarios.md`.

## Stage 6: Human approval before execution
AskUserQuestion with two questions in one call:
- Header `SPT gate`: **"Do you approve executing these test cases in the sandbox?"** Options: `Approve all test cases and run` / `Approve only selected test cases` / `No, do not run the tests`.
- Header `Sandbox`: **"Which sandbox should the tests run in?"** Options: each alias in `spt.config.json` `allowedOrgs` that isn't a `CHANGE_ME` placeholder (the user can type another alias under Other).

Then:
- **Approve all:** `node "S/approval-gate.mjs" freeze --all`.
- **Approve selected:** tell the user to open `scenarios.md`, change `[ ]` to `[x]` for each test case to run, save, and reply "done". Wait. Then `node "S/approval-gate.mjs" freeze` and report how many were approved and rejected.
- **No:** `node "S/approval-gate.mjs" reject`. Stop (Rule 4). No tests are executed.
- If the chosen alias is not in `allowedOrgs`, add it to `spt.config.json` only after `preflight.mjs` confirms it is a sandbox (Stage 7 step 1).

## Stage 7: Execute and show results
1. Gate checks; stop and explain on any failure:
   `node "S/approval-gate.mjs" verify` and `node "S/preflight.mjs" --org <alias>` (must confirm the org is a sandbox).
2. Delegate to the **apex-test-author** agent: Apex test classes for the approved test cases with `executionMode: "apex"` only, in `<testSourceDir>/main/default/classes/`, named `SPT_<Area>_Test`, one method per test case named `SC_###_<shortName>`, plus `test-map.json`. It must not modify `approved-scenarios.json`.
3. Execute according to `execution.mode` in spt.config.json:
   - `validate` (default, leaves nothing in the org): `sf project deploy validate --source-dir <testSourceDir> --target-org <alias> --test-level RunSpecifiedTests --tests <Class1> --tests <Class2> --wait <waitMinutes> --json > .spt/runs/<runId>/raw-test-output.json`
   - `deploy`: `sf project deploy start` with the same flags.
   A non-zero exit code is expected when tests fail; continue.
4. `node "S/parse-results.mjs" --org <alias>`. If there are compile errors (`componentErrors`), fix only the generated test classes (never the client's code), and re-run steps 3–4 at most twice.
5. `node "S/export-xlsx.mjs" results` → `test-results.xlsx`.
6. Present the results: a summary table (Pass / Fail / Error / Not run / Manual), then every failed or errored test case with its ID, title, test method and the one-line error message, then the manual test checklist. Link `test-results.xlsx`.

## Stage 8: Failure analysis and recommendations
If nothing failed or errored, say so, point to the manual checklist, and go to Closing.
1. AskUserQuestion, exact question:
   **"Can I show the failure analysis and recommendations?"**
   Options: `Yes, show the analysis` / `No, finish here`. Record gate `failures`.
2. On yes: delegate to the **failure-analyst** agent (writes `failure-analysis.json` and `failure-report.md`), then `node "S/export-xlsx.mjs" failures` → `failure-analysis.xlsx`.
3. Present the verdict (Go / No-Go / Go with conditions), then for each failure: root cause (and its class), impacted components, recommended fix or next steps, owner and severity, and regression considerations. Link `failure-analysis.xlsx` and `failure-report.md`.

## Closing
1. If the run folder has `org-knowledge-proposals.md` with unticked items, show them and ask with AskUserQuestion: **"Add these org-specific learnings to the org knowledge file?"** Options: `Add all` / `Let me choose` / `Not now`. Merge accepted items into the org knowledge file and mark each proposal `[accepted]` or `[rejected]`.
2. List every deliverable in the run folder (Excel files first).
3. Say: after fixes are deployed to the sandbox, run `/spt:start` again and choose to re-run the approved tests.
