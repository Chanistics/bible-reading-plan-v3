# Additional Festival Readings

## Sources and Licenses

- Festival services: [Hebcal Leyning API](https://www.hebcal.com/home/4277/leyning-torah-reading-api), fetched with `i=on`, `triennial=off` on 2026-09-20. [CC BY 4.0](https://www.hebcal.com/home/358/about-hebcal).
- Chapter/verse conversion: Copenhagen Alliance [versification-specification](https://github.com/Copenhagen-Alliance/versification-specification), commit `56c093e`, `versification-mappings/standard-mappings/eng.json`. CC BY-SA 4.0. The included mapping and derived conversion rows retain this license.
- Verse bounds and Korean book names: existing local Korean Bible data. The five Torah books also use the existing Hebcal commandment-numbering conversion in `generator.js`.

## Scope

Rosh Hashana, Yom Kippur, Pesach, Shavuot, Sukkot, Shemini Atzeret/Simchat Torah, Purim and Tisha B'Av, including supplied evening and afternoon readings. These are the Israel general-region dates and Hebcal default leyning/haftarah/megillah selections. They are not a universal representation of every communal custom. Jerusalem/walled-city Purim, minor fasts, Rosh Chodesh and the four special Shabbatot are not added to this feature. Some captured raw records retain Shushan Purim for provenance; the build excludes it.

`2025.json` through `2029.json` retain the selected original structured API records. `eng-versification.json` retains the conversion source. No Bible text from these services is redistributed; the app opens its existing local KRV/KJV reader.

## Build and Verification

Run `node tools/build-festival-readings.js` from the project root. Existing source snapshots are reused. The generated `festival-readings-data.js` is local-file compatible and includes dates, structured readings, local book bounds and conversion rows. It does not change `calendar-data.js`, `generator.js`, reading-plan cache keys or user progress.

`node tools/validate-festival-readings.js` checks all supplied service references against the existing local Bible, full Megillot ranges, historical cycle-boundary cases, unchanged annual-plan hashes, progress exclusion, offline operation and post-bundle fetching/cache/retry. Annual-plan hashes capture the 2026-09-20 baseline before this feature; changes to those hashes require an intentional annual-plan change.

2025-2029 are bundled. Beyond those years, the same Israel Leyning API is fetched in up-to-180-day blocks and cached on the device when possible. Optional reading failures do not block annual reading or progress tracking.

## Display and Counting

- Supplemental readings appear separately below today's annual checklist and the weekly schedule, with explicit dates and evening/day/afternoon labels.
- Each reference opens individually, preserving discontinuous haftarah segments without filling the gaps.
- A separately listed maftir is labeled as an additional Torah reading. A Mincha's final aliyah remains part of its continuous Torah passage.
- Megillot are linked in full on the service dates supplied by Hebcal, independently of the annual plan's existing weekday splits.
- Supplemental readings have no completion checkbox and are never stored as annual-plan fields. Annual progress, denominator, daily completion and whole-week completion remain unchanged.
