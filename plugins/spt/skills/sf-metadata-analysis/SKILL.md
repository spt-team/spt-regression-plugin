---
name: sf-metadata-analysis
description: How to read Salesforce DX source-format metadata to find dependencies and impact. Use whenever analysing a Salesforce requirement, change, blast radius, impact analysis, or "what does this field/flow/object affect" question in an SFDX project, even if the user does not say "blast radius".
---

# Reading Salesforce source metadata for impact

## Where things live (source format)
| Component | Path pattern | Key XML / code to inspect |
|---|---|---|
| Object | `objects/<Obj>/<Obj>.object-meta.xml` | sharingModel, enableHistory |
| Field | `objects/<Obj>/fields/<F>.field-meta.xml` | type, formula, referenceTo, summaryForeignKey (roll-up), lookupFilter, required |
| Validation rule | `objects/<Obj>/validationRules/*.validationRule-meta.xml` | active, errorConditionFormula |
| Record type | `objects/<Obj>/recordTypes/*` | picklistValues |
| Flow | `flows/*.flow-meta.xml` | status, processType, start/object, start/triggerType, recordTriggerType, recordUpdates, recordCreates, subflows, actionCalls (apex), scheduledPaths |
| Trigger | `triggers/*.trigger` | `on <Obj>(events)`, handler class calls |
| Apex | `classes/*.cls` | SOQL, DML, `Schema.`, `@InvocableMethod`, `Database.` |
| Layout | `layouts/<Obj>-<Name>.layout-meta.xml` | `<field>` |
| Perm set / profile | `permissionsets`, `profiles` | fieldPermissions, objectPermissions |
| LWC / Aura | `lwc/<c>/`, `aura/<c>/` | `@salesforce/schema/Obj.Field` imports, Apex imports |

## Search patterns (use Grep)
- Field usage anywhere: `Obj\.Field__c|\bField__c\b`
- Flow record context: `\$Record\.Field__c` and `\$Record__Prior`
- Apex writes: `\.Field__c\s*=` ; SOQL: `SELECT[^;]*Field__c`
- LWC schema imports: `@salesforce/schema/Obj.Field__c`
- Roll-ups on parent: `<summaryForeignKey>Child.Lookup__c</summaryForeignKey>` and `<summarizedField>`

## Order of execution (use to explain interactions)
1. System validation → 2. Before-save record-triggered flows → 3. Before triggers → 4. Custom validation rules → 5. Duplicate rules → 6. Save (not committed) → 7. After triggers → 8. Assignment, auto-response rules → 9. Workflow rules (field updates re-fire before/after triggers once) → 10. Escalation rules → 11. After-save record-triggered flows → 12. Entitlement rules → 13. Roll-up summaries / cross-object workflow on parent (parent goes through save) → 14. Sharing recalculation → 15. Commit → 16. Post-commit: emails, async Apex, scheduled paths.
Verify against current Salesforce docs if the org uses features added recently.

## Known blind spots of local metadata
Dynamic SOQL/field names built from strings, managed-package internals, data (custom settings/metadata *records* unless retrieved), reports/dashboards/list views unless retrieved, org-only configuration (e.g. some setup settings), standard (non-custom) field writes inside Apex (no local `.field-meta.xml` exists to catalog them against), and field access through a call chain the script doesn't follow (trigger -> handler -> a second service class it calls). `build-metadata-index.mjs` does resolve custom-field references/writes in Apex made through a variable (`opp.Discount__c`, not just literal `Opportunity.Discount__c`), but only within the file being scanned — always list anything beyond that under Limitations rather than guessing.
