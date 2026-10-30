# Motion — Research and Content Sourcing

Updated: 2026-10-30
Status: Saved research notes and requirements for future content preparation. No production meal library, workout dataset, or executable seeders have been created yet.

## Confirmed Content Requirement

Prepare real, source-backed foods, meals, exercises and programs for Motion. Do not invent nutrient values, citations, exercise instructions, video URLs or claims of clinical validation. Use simple original exercise descriptions. Programs must use the agreed goals, fitness levels and 2/3/4/5 training-day options, with paired nutrition days including rest days.

## Saved Carbohydrate Research

1. ACSM-hosted GSSI educational Q&A, *Supporting Female Athletes*, published April 23, 2025; reviewed October 30, 2026.
   https://acsm.org/gssi-presented-webinar-qa-supporting-female-athletes/
   Relevant questions: 6, 8 and 9. Daily carbohydrate guidance is based on body mass, training duration/intensity and performance goals; it does not support a blanket female-specific reduction. Differences in fuel utilization do not by themselves establish a lower carbohydrate requirement. This is educational webinar material, not an individualized prescription or a new formal ACSM position stand.
2. USADA, *Fueling for Performance*, 2026 nutrition guide; located October 30, 2026.
   https://www.usada.org/wp-content/uploads/2026-TS-Nutrition-Guide.pdf
   Provides carbohydrate ranges by body mass and training load. Reopen and verify the applicable table/page before using ranges in a content dataset. General athletic guidance must not be applied mechanically to every gym user or fat-loss plan.
3. NIH Office of Dietary Supplements, *Dietary Supplements for Exercise and Athletic Performance — Health Professional Fact Sheet*; located October 30, 2026.
   https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-HealthProfessional/
   Supports adequate energy and macronutrient intake for activity. Contextual guidance; not a food-composition database or a source of individual recipe nutrient values.
4. ISSN position stand, *Nutritional concerns of the female athlete* (2023); located October 30, 2026.
   https://pmc.ncbi.nlm.nih.gov/articles/PMC10210857/
   Follow-up source for female-athlete nutrition. Search excerpts were available; full-page access encountered a verification challenge in this session. Read the original full text before extracting detailed implementation rules.

## Implications for Motion

- Do not implement Female => lower carbohydrate or a fixed gender multiplier.
- Height, age and weight are profile measurements, not an imported InBody report.
- The same workout program does not establish identical food-portion requirements for every user.
- Admin/dietitian-reviewed portion tiers are a proposal, not an approved implemented feature. The current plan still uses stored admin-defined portions; settle portion personalization before presenting the library as individually tailored nutrition.
- The earlier 4 g/kg example was illustrative arithmetic, not a target approved for seeding.
- Keep food allergies/flags and substitutions deterministic in NestJS. AiProgramFitter remains exercise-only.

## Required Provenance for Future Datasets

- Maintain a versioned source manifest with source title/organization, exact URL or dataset record ID, publication/version where available, access date, applicable record IDs, and reuse/license notes. Recheck sources when building the actual dataset.
- Foods: use authoritative food-composition records; preserve food identity, raw/cooked state, edible portion, per-100-g units, nutrient record ID and provenance. Missing values stay unknown; never replace them with fabricated zeros. Nutrient data and allergen evidence are separate inputs.
- Meals: record ingredient weights, servings and preparation; calculate totals from traceable food records with explicit yield/portion assumptions. Label calculated recipe values as estimates, not laboratory measurements. Do not claim equivalent nutrition merely because foods share a section.
- Exercises: source movement technique from authoritative exercise/strength organizations or qualified references. Write simple original setup/movement instructions; identify equipment and target muscles. Source usable licensed media separately; a research citation is not permission to copy video or descriptions.
- Programs: document the rationale and sources for frequency, volume, intensity, rest and progression. Label the resulting Motion program as an evidence-informed synthesis unless that exact program was studied. Research does not replace content review or establish injury-specific safety.
- Published content needs the plan's editorial review; no automatic publication of generated drafts. Mark reviewer status honestly.

## Two-Stage Seeding Contract

1. seed-lookups.ts: populate modeled static reference tables, such as roles, body areas, allergens and legal restriction codes where stored as tables. Keep fixed enums as enums unless a real table is justified. Use stable codes/IDs; no fake users or personal assignments.
2. seed-content.ts: verify lookup versions/keys, then load sourced exercises, ingredients/foods, food sections, meals/meal sections, and combined workout-program/nutrition aggregates in dependency order. Matching configuration follows its referenced programs. Records reference existing lookup keys and shared library records.

The content stage is separate from lookup initialization. Missing dependencies fail before writes. Each stage is transactional and idempotent; content-stage failure rolls back that stage while preserving an already committed lookup stage. Program and paired nutrition creation remain atomic. Seed execution reads versioned local data and performs no live research, scraping, model calls or media downloads.

Demo-user/execution scenarios remain a separate development/test-only seed path. Actual file implementation follows migrations and entities; these filenames currently specify planned entry points.
