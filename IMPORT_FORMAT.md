# Daily report import format

EVOLV reads the daily journal you get from Gemini. The parser is deterministic and offline: no LLM, no network. It does not require one fixed layout; it recognises common patterns. Anything it cannot read reliably is flagged for you to fix in the preview, never guessed.

Parser code: `src/lib/parser/` (version shown in Settings).

## Recognised content

| Area | Examples it understands |
|---|---|
| Date | `Date: Wednesday, 25 November 2026`, `2026-11-25`, `25/11/2026` (read as day/month, the Indian convention), `Nov 25, 2026`, `25th Nov 2026`. A date in the title line also works. If the year is missing, the current year is assumed and flagged. A weekday that contradicts the date is flagged. |
| Metadata | `Timezone:`, `Goal:` / `Fitness Goal:`, `Weight:` / `Body Weight:` (kg or lb), `Height:` (`6'0"`, `6 ft`, `183 cm`) |
| Entry headers | `### Entry 1 — 8:10 AM \| Breakfast`, `1) Breakfast (08:30) – Poha, 1 plate`, `### Breakfast — 8 AM`, `Lunch (1 PM): Rajma chawal`, or one row per meal in a markdown table |
| Entry fields | `Meal:` / `Food:` / `Item:`, `Description:`, `Quantity:` / `Portion:`, `Calories:` / `kcal` / `Energy:`, `Protein:` / `P`, `Carbs:` / `Carbohydrates:` / `C`, `Fat:` / `F`, `Fiber:` / `Fibre:`, `Food Quality Score: 7.5/10`, `Brand:`, `Note:` |
| Inline macros | `340 kcal \| P: 19 g \| C 33g \| F: 13 g \| Fiber 5 g`, `Calories: 520 kcal, Protein: 28 g, …`, `12 g protein, 4 g fibre` |
| Inline fields in names | `Lite coffee 150 ml — Score: 7/10`, `Dal khichdi (Score 6/10) \| Qty: 1.5 cups` |
| Times | `8:10 AM`, `8.10pm`, `8 PM`, `20:45`, `2045 hrs`, `noon` |
| Meal categories | Breakfast, morning snack, lunch, evening snack, dinner; others (pre/post-workout, late-night, supplements) map to Other with the original label kept. A plain "Snack" is placed by time: before noon is a morning snack, 3–9 pm an evening snack. |
| Totals | A `Daily Totals` section (key/value lines or a `Nutrient \| Consumed \| Target \| …` table), a `TOTAL:` line, or a `Total` row in an entries table. `1,757 / 2,250 kcal` reads as consumed / target. |
| Apple Watch | `Move: 642 / 600 kcal`, `Active Calories: 410 kcal (goal 600)`, `Exercise: 48 / 30 min`, `Stand: 11 of 12 hrs`, `Steps: 10,284`, `Walking + Running Distance: 7.6 km` (miles and metres converted) |
| Workouts | `Workout: Outdoor Walk — 4.2 km · 46 min · 228 kcal`, or separate `Workout Type / Duration / Distance / Calories / Avg Heart Rate` lines. Type is inferred (walking, running, cycling, swimming, strength, cardio, sports, other). |
| Energy balance | Lines in an `Energy Balance` section are kept as text, and a stated deficit or surplus (`deficit ~850 kcal`) is stored for reference. EVOLV's own energy figures never use it. |
| Notes / uncertainty | Bullet lines under `Notes`, `Observations`, `Uncertainty`, `Assumptions`, `Caveats` |

Markdown decoration (`#`, `**`, bullets, emoji) is ignored. Indian brand names (Amul, Saffola, MuscleBlaze, Haldiram's, Epigamia and others) are detected for the optional brand field.

## Values

- `~345`, `approx. 12 g`, `about 30 g`: recorded and marked approximate (shown with `~` in the preview).
- `340–360 kcal`: midpoint (350) used, marked approximate, with a warning so you can edit it.
- `<1 g`: recorded as the stated bound, marked approximate.
- `N/A`, `—`, `unknown`, `?`: recorded as missing (blank), never zero.
- A nutrient the report does not mention is missing, not zero.
- `kJ` values are converted to kcal and flagged.

## Checks before import

- A valid date is required.
- Each included entry needs a name and at least one nutrition value; otherwise fix it or untick it.
- Entries are summed and compared with the report's totals. Differences of up to 5 kcal or 1 g count as rounding; anything larger is flagged. You choose whether the day uses the sum of entries (recommended) or the printed totals. The report's numbers are stored unchanged either way.
- An entry whose macros imply a very different energy (protein×4 + carbs×4 + fat×9) from its stated calories is flagged.
- Lines EVOLV could not place are listed under "Lines not imported". The full original text is always stored.

## Duplicates

- **Identical text** (ignoring whitespace and case) or **the same day's entries in a different format** is detected and shown.
- If a report for the date already exists, you choose **Merge** (add only entries not already there; fill blank activity fields only) or **Replace** (remove what the earlier import created, keep manual records and the earlier raw text), or cancel. Nothing is overwritten without confirmation.

## Adding support for a new layout

1. Add the report as a fixture in `src/test/fixtures/`.
2. Add a test in `src/lib/parser/parser.test.ts` describing the expected output.
3. Usually only aliases in `labels.ts` need extending; structural changes go in `parse.ts`.
