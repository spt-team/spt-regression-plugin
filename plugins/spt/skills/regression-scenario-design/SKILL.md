---
name: regression-scenario-design
description: Techniques for designing Salesforce regression test scenarios from an impact analysis. Use whenever generating test cases, test scenarios, UAT scripts or regression packs for Salesforce changes.
---

# Designing Salesforce regression scenarios

## Coverage heuristics per component type
| Component | Scenarios to consider |
|---|---|
| Record-triggered flow | entry criteria met / not met; each decision branch; `$Record__Prior` change detection (field changed vs unchanged); bulk 200; recursion with other automation |
| Apex trigger | insert/update/delete/undelete events in scope; bulk; recursion guard; mixed-DML |
| Validation rule | each OR branch fires; boundary values; bypass (custom permission/profile) works; integration user path |
| Formula / roll-up | recalculation on child insert/update/delete/reparent; null handling |
| Picklist / record type | each affected value; record-type-specific values; dependent picklists |
| Permissions / sharing | user with access succeeds; user without access blocked; FLS read-only |
| Integration | integration user can still write required fields; field/validation changes do not reject inbound payloads |

## Categories
positive, negative, boundary, bulk, security, integration, regression (unchanged behaviour must still work).

## Priority
P1 = revenue/data integrity/integration-breaking or explicit acceptance criterion; P2 = important behaviour with workaround; P3 = cosmetic or low-use.

## Quality bar for each scenario
Concrete data (API names and values), one clear action, observable expected result, traceable to at least one blast-radius component. Avoid duplicates; merge scenarios that assert the same path.
