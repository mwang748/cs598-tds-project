# Combined hotel, room, rate, and date selection

The participant content is in `public/study.default.json`. Rental-car tasks were added in content version `draft-12` without changing these hotel questions.

## Question order

1. Four flight-selection scenarios.
2. Four combined hotel/room/rate scenarios.
3. Four rental-car-selection scenarios.
4. Four existing flight-reservation preparation scenarios.

Each group runs tight budget/fixed schedule, tight budget/flexible schedule, higher budget/fixed schedule, then higher budget/flexible schedule. There are 16 tasks in the current draft, including four rental-car questions. The four old `room-and-rate` questions are removed; combined accommodation questions retain the `hotel-selection` ID. Historical room/rate answers should not be treated as equivalent to the new combined task.

## Shared fictional inventory

Prices cover three nights for one adult, including taxes and mandatory fees. All rooms have private bathrooms. Availability and prices are identical across conditions; budgets and allowed dates determine which packages qualify.

| Hotel / room / rate | Walk to Boston Common | Thu–Sun | Fri–Mon | Sat–Tue | Terms |
| --- | --- | --- | --- | --- | --- |
| Beacon Court / Standard Queen / Saver | 5 min | Unavailable | $600 | Unavailable | Pay now; nonrefundable |
| Common Street / Standard Queen / Saver | 10 min | $540 | $570 | $510 | Pay now; nonrefundable |
| Garden Square / Standard Queen / Flexible | 15 min | $550 | Unavailable | $580 | Pay at hotel; free cancellation until 48 hours before check-in |
| Harbor Point / Standard Queen / Saver | 20 min | Unavailable | $550 | $520 | Pay now; nonrefundable |
| Parkside Grand / Deluxe King / Saver | 2 min | $900 | $990 | $930 | Pay now; nonrefundable |

Hotel, room, and rate are one package; each allowed stay creates a distinct hotel/room/date package. There is only one room/rate offer per hotel in this minimum version, not multiple room upgrades within a property. Terms and room types do not vary by date.

## Conditions and authored chatbot choices

| Condition | Budget | Dates | Matching packages / hotels | Recommended shortlist (C) | Autonomous choice (D) |
| --- | --- | --- | --- | --- | --- |
| Tight / fixed | $600 | Fri–Mon | 3 / 3 | Common Street $570; Harbor Point $550 | Common Street, Fri–Mon, $570 |
| Tight / flexible | $600 | Any listed stay | 8 / 4 | Common Street Sat–Tue $510; Garden Square Thu–Sun $550 | Garden Square, Thu–Sun, $550 |
| Higher / fixed | $1,050 | Fri–Mon | 4 / 4 | Common Street $570; Parkside Grand $990 | Common Street, Fri–Mon, $570 |
| Higher / flexible | $1,050 | Any listed stay | 11 / 5 | Common Street Sat–Tue $510; Garden Square Thu–Sun $550; Parkside Grand Thu–Sun $900 | Garden Square, Thu–Sun, $550 |

A is independent manual search and choice. B lists every eligible package without a recommendation, grouped alphabetically by hotel to reduce repetition. C shows only the recommended shortlist and leaves the final choice to the participant. D selects a package and dates without approval, with an explanation. No option reserves or purchases anything.

## Fixed assumptions

- Prefer proximity to Boston Common and free cancellation, but consider giving these up for savings. Preferences are unchanged across conditions.
- A three-night stay is required in every condition.
- Flexible stays have no preferred dates; the whole trip, including transportation, can shift without extra cost.
- These accommodation tasks are independent of flight answers. Selecting a Friday flight in an earlier question does not prevent a Thursday hotel check-in here.
- Unavailable means no room for those dates; an available package priced above the budget is excluded for a different reason.
- Both fixed-date scenarios have no matching free-cancellation offer in this inventory. D explicitly states that the selected rate is nonrefundable rather than claiming all preferences were satisfied.
- Nothing guarantees that participants will choose a different agency level in every condition. The follow-up asks why and whether hotel versus room/rate delegation should differ.

The `eligiblePackages`, `recommendedPackageIds`, and `selectedPackageId` fields in each question's hidden researcher metadata support consistency checks; they are not participant-visible choices.

Each response names only hotels displayed in that response. Excluded hotels are not introduced in surrounding prose. Automatic-choice explanations describe the selected package without referring to unseen alternatives.
