# EVOLV database schema

IndexedDB database `evolv`, managed by Dexie (`src/lib/db/db.ts`). Current schema version: **1**.

Conventions: `date` is a local calendar day `yyyy-MM-dd`; `createdAt`/`updatedAt` are ISO instants; nutrient fields are `number | null` where `null` means "not supplied".

| Table | Primary key | Indexes | Purpose |
|---|---|---|---|
| `userProfiles` | `id` (`"primary"`) | | Profile details. Unknown fields stay `null`. |
| `goalVersions` | `id` | `effectiveFrom` | Targets that apply from a date until the next version. |
| `dailyImports` | `id` | `date`, `contentHash`, `fingerprint`, `status` | One row per imported report: raw text, metadata, reported totals and targets, calculated totals, notes, warnings, `active`/`replaced`. |
| `dailyNutritionSummaries` | `id` | `&date` (unique) | Only when the user chose the report's printed totals for a day. Otherwise totals are derived from entries. |
| `foodEntries` | `id` | `date`, `[date+order]`, `mealCategory`, `importId`, `mealName` | Meals with nutrients, score, approximations, provenance, correction snapshot. |
| `activityEntries` | `id` | `&date` (unique), `importId` | One Apple Watch summary per day. |
| `workoutSessions` | `id` | `date`, `type`, `importId` | Workouts (strength and cardio). |
| `workoutExercises` | `id` | `sessionId`, `exerciseId`, `name` | Exercises within a session. |
| `workoutSets` | `id` | `sessionId`, `workoutExerciseId` | Sets: reps, weight, rest. |
| `weightEntries` | `id` | `date`, `importId` | Weigh-ins (several per day allowed; analytics average them). |
| `bodyMeasurements` | `id` | `date` | Waist, chest, arm, thigh, hip (cm), body fat (%). |
| `exerciseLibrary` | `id` | `&name` (unique), `muscleGroup` | Editable exercise list (12 built-ins seeded). |
| `applicationSettings` | `id` (`"app"`) | | Theme, overview widgets, ranges, calorie tolerance, backup reminder, last backup time. |

## Relationships

- `foodEntries.importId`, `activityEntries.importId`, `workoutSessions.importId`, `weightEntries.importId` → `dailyImports.id` (null for manual records).
- `workoutExercises.sessionId` → `workoutSessions.id`; `workoutSets.workoutExerciseId` → `workoutExercises.id`.
- `workoutExercises.exerciseId` → `exerciseLibrary.id` (nullable; set to null if the library entry is deleted, while the name is kept).
- `dailyImports.replacedById` → the import that replaced it.

## Provenance

`source`: `import`, `manual`, `profile` or `backup`. Imported food entries and activity days edited by the user get `corrected: true`, `correctedFields`, and (for food) an `original` snapshot of the first-recorded values.

## Seed data (first run only)

Profile (height 182.9 cm = 6 ft, goals, India / Asia/Kolkata / INR / Apple Watch), initial targets effective from `1970-01-01` (2,250 kcal, 155 g protein, 220 g carbs, 70 g fat, 32 g fiber), settings, 12 exercises, and a 90 kg starting weigh-in dated the first day EVOLV is opened (source `profile`).

## Migrations

Add a new `this.version(n).stores({...}).upgrade(tx => ...)` block in `EvolvDB` and bump `DB_SCHEMA_VERSION`. Never edit an existing version block; existing installs replay them in order.

## Backup format

```json
{
  "format": "evolv-backup",
  "formatVersion": 1,
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "ISO instant",
  "counts": { "<table>": 0 },
  "data": { "<table>": [ { "...": "rows exactly as stored" } ] }
}
```

Restore validates the header, every row (Zod), counts against the header, duplicate ids, and workout references before touching the database. It then clears and refills all tables in one transaction; any failure rolls back to the previous data.
