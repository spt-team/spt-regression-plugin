# Requirement: Remap retired products on open opportunities

**ID / Ticket:** EXAMPLE-001
**Client:** Example Co

## Business need
Retired products still appear on open opportunities, causing incorrect forecast and invoicing.

## Proposed change
- New checkbox `Product2.Is_Retired__c`.
- New lookup `Product2.Replacement_Product__c` (Product2).
- Record-triggered flow on OpportunityLineItem (before save): if the product is retired and the opportunity is open, swap PricebookEntry to the replacement product's entry in the same price book.
- Validation rule on OpportunityLineItem blocking new lines for retired products with no replacement.

## Acceptance criteria
1. Given an open opportunity, when a line is added for a retired product with a replacement, then the line is saved with the replacement product and the same quantity.
2. Given a retired product without a replacement, when a line is added, then the save is blocked with message "Product is retired".
3. Closed opportunities are not changed.

## Known dependencies / integrations
ERP invoicing sync reads OpportunityLineItem.Product2Id on Closed Won.

## Out of scope
Quote line items.
