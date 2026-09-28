---
name: sf-remediation
description: Diagnosing Salesforce Apex test failures and writing remediation steps. Use whenever interpreting failed Apex tests, deployment validation errors, or regression failures in Salesforce.
---

# Diagnosing Salesforce test failures

## Common error signatures
| Message contains | Usual cause | First check |
|---|---|---|
| `FIELD_CUSTOM_VALIDATION_EXCEPTION` | Validation rule fired | Which rule (message text) and whether test data or the rule is wrong |
| `REQUIRED_FIELD_MISSING` | Test data incomplete or field newly required | field-meta `required`, layouts are irrelevant in Apex |
| `CANNOT_EXECUTE_FLOW_TRIGGER` / `FLOW_EXCEPTION` | Flow fault | Flow name in message; open flow, find element; check null handling |
| `INSUFFICIENT_ACCESS` / `INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY` | Sharing/permission | runAs user's perm sets, OWD, sharing rules |
| `Too many SOQL queries: 101` / `CPU time limit` | Non-bulkified automation | Loops with SOQL/DML in trigger/flow; bulk scenario |
| `DUPLICATE_VALUE` / `DUPLICATES_DETECTED` | Unique field or duplicate rule | Test data uniqueness |
| `MIXED_DML_OPERATION` | Setup + non-setup DML | Test user creation outside runAs |
| `Assertion Failed: SC-###` | Behaviour differs from expected | Compare expected vs actual; trace which automation set the value (order of execution) |
| `Variable does not exist` / `Invalid type` | Test compile error or metadata not in sandbox | Is the changed metadata deployed to the target sandbox? |

## Root-cause classes
Regression defect, Requirement defect, Test defect, Environment/data. Distinguish test defects honestly: if the scenario expectation contradicts the requirement, it is a test or requirement ambiguity, not a code defect.

## Remediation step format
1. Component to change (API name + path)
2. Specific change
3. Re-test: deploy the fix to the sandbox, then run `/spt:start` and choose to re-run the approved tests (approval stays valid while the test cases are unchanged)
