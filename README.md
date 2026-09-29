# SPT Regression Plugin for Claude Code

Requirement-driven Salesforce regression testing ("Regression as a Service") as a Claude Code plugin. It replaces the manual prompt-by-prompt process with **one guided, skill-based workflow** that works for any requirement against any client's Salesforce metadata, and asks for human approval at every critical stage.

## The workflow
Run **`/spt:start`** in Claude Code (VS Code, CLI or desktop app) inside a Salesforce DX project. The plugin then guides you through eight stages and never moves past an approval gate without your explicit "Yes":

| # | Stage | The plugin asks | Output |
|---|---|---|---|
| 1 | Upload requirement | **"1. Upload the Requirement?"** (attach, give a path, or paste text; .docx / .pdf / .md / .txt) | Run folder |
| 2 | Approval to analyse | **"2. Can I start the analysis based on the requirement against the local Salesforce metadata to identify the impacted areas and blast radius?"** | Gate |
| 3 | Impact analysis | – | **`impact-analysis.xlsx`**: impacted components, dependencies, affected areas, blast radius, relevant metadata, risks and considerations |
| 4 | E2E Test Case Simulation | **"3. Do you want to proceed with the End-to-End (E2E) Test Case Simulation?"** Yes, impacted areas only / Yes, overall org metadata / No, stop here | **`e2e-simulation.xlsx`**: end-to-end business flows traced step by step through the metadata, with each step predicted Pass / At risk / Fail, plus predicted issues, test data and coverage (simulation only; nothing runs in the org) |
| 5 | Test cases & Regression Test Pack | **"Based on the identified changes and impacts, can I generate the possible test cases and Regression Test Pack?"** | **`regression-test-pack.xlsx`** |
| 6 | Approval before execution | **"Do you approve executing these test cases in the sandbox?"** Approve all / approve selected / **No: stop, nothing is run** | Hash-locked approval |
| 7 | Execution results | – | **`test-results.xlsx`**: passed and failed test cases, messages, manual checklist |
| 8 | Failure analysis | **"Can I show the failure analysis and recommendations?"** | **`failure-analysis.xlsx`**: root cause, impacted components, recommended fixes, regression considerations |

When the impact analysis (and later the E2E simulation) is ready, the plugin tells you exactly where it is: a clickable link to `impact-analysis.xlsx`, the blast radius report, the run folder, and the full path on disk.

Answering **No** at any gate stops the workflow and records the decision. Run `/spt:start` again to resume where you stopped, start a new requirement, or re-run the approved tests after a fix.

Global Salesforce rules are built into the plugin's skills. Client-specific behaviour lives in the client repo's `spt-org-knowledge.md`, which the workflow offers to update at the end of each run.

## Install (per user, once)

Prerequisites: Claude Code, Node.js 18+, Salesforce CLI (`sf`), a Salesforce DX project with its metadata retrieved, an authorised **sandbox**.

**From a terminal (one line):**
```
claude plugin marketplace add https://github.com/spt-team/spt-regression-plugin.git && claude plugin install spt@spt-marketplace
```

**Or inside the Claude Code chat in VS Code:**
```
/plugin marketplace add https://github.com/spt-team/spt-regression-plugin.git
/plugin install spt@spt-marketplace
```
Use the full `https://` address as shown. The short form `spt-team/spt-regression-plugin` downloads over SSH and fails with "Plugin spt not found in marketplace" on machines without a GitHub SSH key.

Restart Claude Code, then type `/spt:start`. Update later with `/plugin marketplace update spt-marketplace`.

Claude Code will also ask permission before running the plugin's scripts (`node …`) and Salesforce CLI commands (`sf …`). Those are Claude Code's own tool prompts, separate from the workflow's approval questions; choose "Yes, don't ask again" for `node` to avoid repeated prompts.

> `npx skills add spt-team/spt-regression-plugin` is **not** a substitute: it copies only the skill files, not the agents, hooks or scripts the workflow needs.

### Team-wide install (recommended)
Commit this to each client project's `.claude/settings.json` so everyone who opens the repo is prompted to install:
```json
{
  "extraKnownMarketplaces": {
    "spt-marketplace": { "source": { "source": "git", "url": "https://github.com/spt-team/spt-regression-plugin.git" } }
  },
  "enabledPlugins": { "spt@spt-marketplace": true }
}
```

## What you get per run (`.spt/runs/<runId>/`)
| File | Content |
|---|---|
| `impact-analysis.xlsx` | Stage 3 deliverable (also `blast-radius.md` / `.json`) |
| `e2e-simulation.xlsx` | Stage 4 deliverable (also `e2e-simulation.md` / `.json`) |
| `regression-test-pack.xlsx` | Stage 5 deliverable (also `scenarios.md` / `.json`) |
| `test-results.xlsx` | Stage 7 deliverable (also `results.json`) |
| `failure-analysis.xlsx` | Stage 8 deliverable (also `failure-report.md` / `failure-analysis.json`) |
| `requirement.*` | Copy of the uploaded requirement (`.docx` also gets `requirement.extracted.md`) |
| `run.json` | Every gate decision: who answered, what, and when |
| `decisions.log.jsonl` | Audit log of each question and the user's answer, captured by a hook |
| `approved-scenarios.json` | Approver, timestamp and SHA-256 of the approved test cases |
| `org-knowledge-proposals.md` | Org-specific facts discovered in this run |
| `attempt-<n>/` | Results of earlier executions when the tests are re-run |

Commit run folders (except raw CLI output) for an audit trail.

## Safety controls
- **Approval gates enforced by scripts**: the analysis, test generation, execution and failure-analysis steps refuse to run until the user's "Yes" for that gate is recorded. "No" stops the workflow.
- **Approval files are protected**: a hook blocks direct edits to `run.json`, `approved-scenarios.json` and `decisions.log.jsonl`; only the gate scripts write them.
- **Execution lock**: the Salesforce CLI cannot deploy or run SPT tests without a valid, unchanged approval; changing the analysis or the approved test cases afterwards invalidates it.
- **Org guard**: `sf` deploy, test and data commands must name `--target-org`, which must be in `allowedOrgs` and must not match `blockedOrgPatterns`.
- **Sandbox check**: `Organization.IsSandbox` is queried before execution, and production is refused.
- **Validate mode (default)**: tests run as a check-only deploy, so nothing is left in the sandbox.

Step-by-step user guide: [docs/SPT-Plugin-User-Guide.docx](docs/SPT-Plugin-User-Guide.docx). See also [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/CUSTOMISING.md](docs/CUSTOMISING.md).
