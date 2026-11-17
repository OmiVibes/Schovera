# Proposed business model — assumptions, not validated financial facts

Prepared 17 November 2026. No customers, sales, willingness-to-pay survey, savings study or demand validation is claimed. All prices/costs below are **chosen hypothetical budgets**, not quotes, market prices or live exchange conversions. They are for explaining arithmetic to judges. No paid service is enabled by this document.

## Buyer, charging model and alternatives

Proposed model: B2B annual software subscription paid by a school. Parent/Teacher access would be included in that school agreement. A buyer might be the school owner or authorized administrator; actual procurement and budget authority must be researched.

- **Per-student:** an illustrative USD 3/student/year, easy to scale with enrollment but requires clear counting rules, annual changes and a support minimum.
- **Per-school:** an illustrative flat USD 600/year for up to 200 students, or USD 2,400/year for up to 800; simpler budgeting, but usage/support limits and overages need a defined agreement. These are alternative examples, not two charges added together.
- **Optional setup/training:** illustrative USD 100 for a small school or USD 250 for a larger school, one time. Scope/hours must be agreed. Excluded from recurring subscription revenue and contribution calculations below.
- **Optional future hardware installation/support:** separately quoted materials, installation and maintenance after hardware acceptance. Manual attendance works without RFID. No hardware is currently certified, sold or installed through this project.

Billing, subscription enforcement, payment processing and commercial contracts are **not implemented**. Do not claim a functioning payment business from these proposed terms.

## Exchange-rate assumption

For arithmetic only, **USD 1 = INR 85**. This is a deliberately illustrative assumption, not a current exchange rate. Thus USD 3 = INR 255/student/year; USD 100 = INR 8,500; USD 250 = INR 21,250. Actual international purchasing, taxes and currency conversion require real quotes later.

## Annual hypothetical operating scenarios

Assume one paying school, full-year service and the proposed USD 3/student annual subscription. Local demonstration hardware is already owned; proposed future hosted-service budgets are included to avoid pretending delivery is free. No hosting provider/region is selected or purchased. SMS/phone sending remains inactive.

| Annual item | 200 students USD | 200 students INR | 800 students USD | 800 students INR |
|---|---:|---:|---:|---:|
| Subscription revenue (`students × 3`) | 600 | 51,000 | 2,400 | 204,000 |
| Hosting/database/backup budget | 120 | 10,200 | 240 | 20,400 |
| Domain budget | 15 | 1,275 | 15 | 1,275 |
| Incremental internet allocation | 60 | 5,100 | 120 | 10,200 |
| Local electricity allocation | 12 | 1,020 | 24 | 2,040 |
| Support (`36h × $5`, `120h × $5`) | 180 | 15,300 | 600 | 51,000 |
| Software maintenance (`18h × $5`, `48h × $5`) | 90 | 7,650 | 240 | 20,400 |
| Contingency budget | 60 | 5,100 | 180 | 15,300 |
| Actual SMS/calls | 0 — disabled | 0 | 0 — disabled | 0 |
| **Total assumed operating cost** | **537** | **45,645** | **1,419** | **120,615** |
| **Illustrative contribution (`revenue − cost`)** | **63** | **5,355** | **981** | **83,385** |
| **Contribution margin (`contribution ÷ revenue`)** | **10.5%** | **10.5%** | **40.875%** | **40.875%** |

Small-school arithmetic: `120 + 15 + 60 + 12 + 180 + 90 + 60 = 537`; `600 − 537 = 63`; `63 / 600 × 100 = 10.5%`.

Large-school arithmetic: `240 + 15 + 120 + 24 + 600 + 240 + 180 = 1,419`; `2,400 − 1,419 = 981`; `981 / 2,400 × 100 = 40.875%`.

These are **contribution examples, not net profit**. They exclude taxes, payment fees, customer acquisition/sales travel, insurance/legal/privacy work, full founder salaries, bad debt, hardware replacement/maintenance and unexpected scale/security costs. Those can reduce or eliminate the remainder. Support/maintenance hourly rates are unverified assumptions, not a claim that skilled engineering costs USD 5/hour. No scale economics or service reliability guarantee is proven by this model.

The small-school example is deliberately tight: support exceeding the budget by 13 hours at the assumed rate would already erase its USD 63 remainder. Prices/limits must be tested rather than claiming automatic profitability.

## Prototype materials budget — hardware unverified

No board/reader compatibility, wiring, power adequacy, performance or supplier price is certified. Quantities are hypothetical. These are **materials capital costs**, separate from annual software operation. They are not a finished installed-product quote.

| Assumed component | Qty per gate | Chosen unit USD | Per-gate USD |
|---|---:|---:|---:|
| Raspberry Pi-class computer (exact model pending) | 1 | 80 | 80 |
| Compatible RFID reader module (selection pending) | 1 | 8 | 8 |
| Correct rated power adapter (selection pending) | 1 | 12 | 12 |
| Suitable storage card | 1 | 10 | 10 |
| Enclosure/protection allowance | 1 | 20 | 20 |
| Cabling/interface allowance | 1 set | 5 | 5 |
| **Gate kit subtotal** | | | **135** |

Assume one card/student at USD 0.50/card. Small school: `1 × 135 + 200 × .50 = $235`; add chosen 10% materials contingency `$23.50` → **USD 258.50 / INR 21,972.50**. Larger school, two gates: `2 × 135 + 800 × .50 = $670`; add `$67` → **USD 737 / INR 62,645**.

Excluded from these capital totals: shipping/import duties/taxes, installation labor, electrical inspection, replacement/lost cards, spare power/storage, onsite network changes and ongoing hardware support. Real components and prices must be verified before procurement. Optional installation/training revenue must cover actual labor; it is not “pure profit”. A hypothetical pass-through of materials at cost creates no hardware margin by itself.

## What must be validated next

Ask consenting school decision-makers about their present workflow and budget, measure staff time in a supervised fictional pilot, test accessibility/language comprehension, obtain reviewed hosting/security/retention costs, validate hardware acceptance and then test price/renewal interest. Record real responses only when actually collected. Never invent customers, testimonials or conversion rates for the pitch.
