# SPT Org Knowledge — <client name>

Org-specific behaviour the SPT agents cannot infer from generic Salesforce rules or from metadata alone.
Everything here overrides general assumptions for THIS org only. Keep entries short and factual.
Maintained by the team; new entries are proposed after each run (`org-knowledge-proposals.md`) and accepted by a person at the end of each `/spt:start` run.

## Business glossary (business term -> API name)
| Business term | API name | Notes |
|---|---|---|
| e.g. Deal | Opportunity | |
| e.g. Retired product | Product2.Is_Retired__c = true | |

## Automation framework
- Trigger framework: <e.g. one trigger per object -> `<Obj>TriggerHandler` -> service classes; or fflib>
- Bypass mechanism: <e.g. custom permission `Bypass_Validation`, hierarchy custom setting `Automation_Settings__c.Disable_Flows__c`>
- Recursion guard: <class/static variable>

## Test data
- Test data factory class: <e.g. `TestDataFactory`> (reuse it in generated tests)
- Mandatory fields / records every test needs: <e.g. Account.Region__c, an active Pricebook2>
- Custom settings / custom metadata that must be populated in tests: <...>

## Users, profiles and integrations
- Integration users and what they write: <e.g. `ERP Integration` user updates Opportunity.Invoice_Status__c>
- Profiles / permission sets that behave differently: <...>
- Managed packages and known side effects: <e.g. CPQ recalculates OpportunityLineItem on save>

## Known org behaviours and gotchas
- <e.g. Validation rule `Opp_Close_Date` is bypassed for the Data Migration profile>
- <e.g. Sandbox `uat` has email deliverability off, so email scenarios are manual>

## Environments
| Sandbox alias | Purpose | Data refreshed | Notes |
|---|---|---|---|
| <uat> | Regression | <date> | |
