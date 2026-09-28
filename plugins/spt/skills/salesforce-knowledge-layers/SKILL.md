---
name: salesforce-knowledge-layers
description: How SPT separates global Salesforce platform rules from org-specific behaviour. Use whenever analysing blast radius, designing scenarios, writing tests or diagnosing failures for a specific client org, or when deciding whether an observed behaviour is standard Salesforce or particular to this org.
---

# Global rules vs org-specific knowledge

Every conclusion SPT reaches must say which layer it rests on.

| Layer | Source | Examples | Applies to |
|---|---|---|---|
| **global-rule** | Plugin skills (`sf-metadata-analysis`, `regression-scenario-design`, `sf-remediation`) | Order of execution, governor limits, validation rules fire on API inserts, roll-ups recalc parents, `MIXED_DML_OPERATION` | Every Salesforce org |
| **org-knowledge** | Client project's org knowledge file (`orgKnowledgeFile` in `spt.config.json`, default `spt-org-knowledge.md`) and project `CLAUDE.md` | Bypass permission names, trigger framework, integration users, managed-package side effects, business glossary, test data factory | This client only |
| **metadata** | Local SFDX source (`metadataPaths`) | Flow X updates field Y; VR Z is active | This org, as of the last retrieve |
| **assumption** | Analyst judgement | "Deal" probably means Opportunity | Must be confirmed by a human |

## Rules
1. Read the org knowledge file at the start of every task. If it is missing, continue with global rules and say so.
2. Precedence: **metadata** > **org-knowledge** > **global-rule** > **assumption**. If org knowledge contradicts the metadata, trust the metadata and flag the stale entry as an org-knowledge proposal.
3. Tag every blast-radius component, scenario assumption and root cause with its `basis` (`metadata`, `org-knowledge`, `global-rule`, `assumption`).
4. Never write org-specific facts into the plugin. Anything learnt about one org goes into that run's `org-knowledge-proposals.md`, and a human accepts it at the end of the guided workflow (`/spt:start`).
5. Propose an org-knowledge entry when you discover something that (a) is not standard Salesforce behaviour, (b) would change a future blast radius, scenario or diagnosis, and (c) is backed by evidence (file path, error message, or reviewer statement).

## Proposal format (`org-knowledge-proposals.md`)
```
- [ ] **<Section of org knowledge file>**: <fact>
      Evidence: <file:line | error message | reviewer comment>  (run <runId>)
```
