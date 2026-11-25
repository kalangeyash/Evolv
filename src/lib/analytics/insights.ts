/**
 * Data-driven insights. Every insight is derived from stored records and
 * carries its evidence. Rules require a minimum sample size before they
 * claim anything, so one unusual day never becomes a "trend".
 */
import type {
  ActivityEntry,
  BodyMeasurement,
  FoodEntry,
  GoalVersion,
  ISODate,
  MealCategory,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "@/lib/db/types";
import { MEAL_CATEGORIES } from "@/lib/db/types";
import { dateRange, formatDay, fromISODate, shiftDate } from "@/lib/utils/dates";
import { MEAL_LABELS, fmt } from "@/lib/utils/format";
import { goalsForDate, targetMet } from "./goals";
import { consecutiveBelowTarget, periodNutrition, type DayNutrition } from "./nutrition";
import { measurementChanges, weightTrendPerWeek, type DailyWeight } from "./body";
import { exerciseRecords } from "./workouts";
import { mean } from "./stats";

export type InsightTone = "positive" | "neutral" | "attention";

export interface Insight {
  id: string;
  title: string;
  /** What the data shows (fact). */
  observation: string;
  /** The numbers behind it. */
  evidence: string;
  range: { start: ISODate; end: ISODate };
  /** Why it matters (interpretation, labelled as such in the UI). */
  why: string;
  action: string;
  tone: InsightTone;
  area: "nutrition" | "activity" | "body" | "strength" | "logging";
}

export interface InsightContext {
  today: ISODate;
  /** Nutrition series covering at least the last 56 days, oldest first. */
  nutrition: DayNutrition[];
  food: FoodEntry[];
  goals: GoalVersion[];
  activity: ActivityEntry[];
  /** One value per day (see dailyWeights). */
  weights: DailyWeight[];
  measurements: BodyMeasurement[];
  sessions: WorkoutSession[];
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
  calorieTolerancePct: number;
}

const MIN_LOGGED_DAYS = 5;

function window(series: DayNutrition[], end: ISODate, days: number) {
  const start = shiftDate(end, -(days - 1));
  return series.filter((d) => d.date >= start && d.date <= end);
}

const r = (v: number) => Math.round(v);
const range = (s: DayNutrition[]) => ({ start: s[0]?.date ?? "", end: s[s.length - 1]?.date ?? "" });

export function generateInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const last14 = window(ctx.nutrition, ctx.today, 14);
  const p14 = periodNutrition(last14, ctx.goals, ctx.calorieTolerancePct);
  const g = goalsForDate(ctx.goals, ctx.today);

  /* ---- 1 & 12: protein consistency ---- */
  const pm = p14.targetMetDays.protein;
  if (pm.of >= MIN_LOGGED_DAYS && g && p14.averages.protein !== null) {
    const share = pm.met / pm.of;
    if (share < 0.5) {
      out.push({
        id: "protein-below",
        title: "Protein is often below target",
        observation: `Protein reached at least 95% of target on ${pm.met} of ${pm.of} logged days.`,
        evidence: `Average ${fmt(p14.averages.protein, { decimals: 1 })} g/day against a ${g.protein} g target.`,
        range: range(last14),
        why: "Consistent protein intake supports muscle retention and gain during recomposition.",
        action: "Add one protein-dense item to the meal that is usually lightest in protein (curd, paneer, eggs, dal, chicken or a whey serving).",
        tone: "attention",
        area: "nutrition",
      });
    } else if (share >= 0.8) {
      out.push({
        id: "protein-consistent",
        title: "Protein target met consistently",
        observation: `Protein reached at least 95% of target on ${pm.met} of ${pm.of} logged days.`,
        evidence: `Average ${fmt(p14.averages.protein, { decimals: 1 })} g/day against a ${g.protein} g target.`,
        range: range(last14),
        why: "This consistency is one of the strongest nutrition habits for recomposition.",
        action: "Keep the current pattern; no change needed.",
        tone: "positive",
        area: "nutrition",
      });
    }
  }

  /* ---- 2 & 11: fiber ---- */
  const fm = p14.targetMetDays.fiber;
  const fiberStreak = consecutiveBelowTarget(ctx.nutrition, "fiber", ctx.goals, ctx.calorieTolerancePct);
  if (fm.of >= MIN_LOGGED_DAYS && fm.met / fm.of < 0.5 && g) {
    out.push({
      id: "fiber-low",
      title: "Fiber is consistently low",
      observation: `Fiber reached target on ${fm.met} of ${fm.of} logged days.`,
      evidence: `Average ${fmt(p14.averages.fiber, { decimals: 1 })} g/day against ${g.fiber} g.${fiberStreak.count >= 3 ? ` Below target on the last ${fiberStreak.count} logged days.` : ""}`,
      range: range(last14),
      why: "Fiber supports digestion and fullness, which makes a sustainable calorie target easier to hold.",
      action: "Add a vegetable side, a bowl of dal or sprouts, or swap one refined grain for a whole grain.",
      tone: "attention",
      area: "nutrition",
    });
  } else if (fiberStreak.count >= 3 && fiberStreak.since) {
    out.push({
      id: "fiber-streak",
      title: "Fiber below target recently",
      observation: `Fiber has been below target for ${fiberStreak.count} consecutive logged days.`,
      evidence: `Since ${formatDay(fiberStreak.since, "d MMM")}.`,
      range: { start: fiberStreak.since, end: ctx.today },
      why: "A short run is not a problem in itself, but it is easy to correct early.",
      action: "Include one high-fiber food (vegetables, legumes, fruit, oats) in tomorrow's meals.",
      tone: "neutral",
      area: "nutrition",
    });
  }

  /* ---- 3: calories vs target ---- */
  if (p14.loggedDays >= MIN_LOGGED_DAYS && p14.averages.calories !== null && g) {
    const complete = last14.filter((d) => d.logged && d.missing.calories === 0 && d.totals.calories !== null);
    const avg = mean(complete.map((d) => d.totals.calories));
    if (avg !== null && complete.length >= MIN_LOGGED_DAYS) {
      const diffPct = ((avg - g.calories) / g.calories) * 100;
      if (Math.abs(diffPct) >= 10) {
        const above = diffPct > 0;
        out.push({
          id: "calories-vs-target",
          title: above ? "Average intake is above your calorie target" : "Average intake is well below your calorie target",
          observation: `Average logged intake is ${fmt(avg)} kcal, ${Math.abs(r(diffPct))}% ${above ? "above" : "below"} the ${fmt(g.calories)} kcal target.`,
          evidence: `${complete.length} days with complete calorie logs.`,
          range: range(last14),
          why: above
            ? "A persistent surplus usually shows up as a rising weight trend over several weeks."
            : "Eating far below target for long periods can make training recovery and muscle retention harder.",
          action: above
            ? "Look at which meals vary most from day to day, and plan portions for those first. Small, sustainable adjustments work better than large cuts."
            : "Check that every meal is being logged. If it is, consider bringing intake closer to target rather than cutting further.",
          tone: above ? "neutral" : "attention",
          area: "nutrition",
        });
      }
    }
  }

  /* ---- 4: weight trend ---- */
  const weights28 = ctx.weights.filter((w) => w.date > shiftDate(ctx.today, -28) && w.date <= ctx.today);
  const trend = weightTrendPerWeek(weights28);
  if (trend && Math.abs(trend.kgPerWeek) >= 0.1) {
    const down = trend.kgPerWeek < 0;
    out.push({
      id: "weight-trend",
      title: down ? "Scale weight is trending down" : "Scale weight is trending up",
      observation: `The fitted trend is ${down ? "" : "+"}${trend.kgPerWeek.toFixed(2)} kg per week.`,
      evidence: `${trend.samples} weigh-ins over ${trend.spanDays} days.`,
      range: { start: weights28[0].date, end: weights28[weights28.length - 1].date },
      why: "Scale weight alone cannot separate fat, muscle and water. Read it alongside waist and strength trends.",
      action: down
        ? "If strength is holding or rising, the current approach is working; keep protein high."
        : "Check waist and strength. A slow rise with a stable waist and rising strength can be consistent with muscle gain.",
      tone: "neutral",
      area: "body",
    });
  }

  /* ---- 5: waist ---- */
  const waist = measurementChanges(ctx.measurements).find((m) => m.key === "waistCm");
  if (waist && waist.count >= 2 && waist.first && waist.latest && waist.change !== null) {
    const span = (fromISODate(waist.latest.date).getTime() - fromISODate(waist.first.date).getTime()) / 86400000;
    if (span >= 14 && Math.abs(waist.change) >= 0.5) {
      const down = waist.change < 0;
      out.push({
        id: "waist-change",
        title: down ? "Waist measurement has decreased" : "Waist measurement has increased",
        observation: `Waist changed ${down ? "" : "+"}${waist.change.toFixed(1)} cm.`,
        evidence: `${waist.first.value} cm on ${formatDay(waist.first.date, "d MMM")} → ${waist.latest.value} cm on ${formatDay(waist.latest.date, "d MMM")} (${waist.count} measurements).`,
        range: { start: waist.first.date, end: waist.latest.date },
        why: "Waist circumference is a practical indicator of abdominal fat change and is less noisy than scale weight.",
        action: "Measure at the same spot and time of day (e.g. at the navel, morning) to keep readings comparable.",
        tone: down ? "positive" : "neutral",
        area: "body",
      });
    }
  }

  /* ---- 6: steps ---- */
  const stepsIn = (start: ISODate, end: ISODate) =>
    ctx.activity.filter((a) => a.date >= start && a.date <= end && a.steps !== null).map((a) => a.steps!);
  const recentSteps = stepsIn(shiftDate(ctx.today, -6), ctx.today);
  const priorSteps = stepsIn(shiftDate(ctx.today, -13), shiftDate(ctx.today, -7));
  if (recentSteps.length >= 4 && priorSteps.length >= 4) {
    const a = mean(recentSteps)!;
    const b = mean(priorSteps)!;
    const ch = ((a - b) / b) * 100;
    if (Math.abs(ch) >= 10) {
      out.push({
        id: "steps-change",
        title: ch > 0 ? "Daily steps are improving" : "Daily steps have dropped",
        observation: `Average steps ${ch > 0 ? "rose" : "fell"} ${Math.abs(r(ch))}% week over week.`,
        evidence: `${fmt(a)} steps/day (last 7 days, ${recentSteps.length} days of data) vs ${fmt(b)} (previous 7 days, ${priorSteps.length} days).`,
        range: { start: shiftDate(ctx.today, -13), end: ctx.today },
        why: "Everyday movement is a large, steady part of energy expenditure.",
        action: ch > 0 ? "Keep the routine that made this possible." : "A short walk after lunch or dinner is an easy way to recover the difference.",
        tone: ch > 0 ? "positive" : "attention",
        area: "activity",
      });
    }
  }

  /* ---- 7: workout frequency ---- */
  const sessionsIn = (start: ISODate, end: ISODate) => ctx.sessions.filter((s) => s.date >= start && s.date <= end).length;
  const recentS = sessionsIn(shiftDate(ctx.today, -13), ctx.today);
  const priorS = sessionsIn(shiftDate(ctx.today, -27), shiftDate(ctx.today, -14));
  if (priorS >= 3 && recentS <= priorS / 2) {
    out.push({
      id: "workouts-declining",
      title: "Workout frequency has declined",
      observation: `${recentS} workout${recentS === 1 ? "" : "s"} in the last 14 days, down from ${priorS} in the 14 days before.`,
      evidence: "Counts all logged workout sessions.",
      range: { start: shiftDate(ctx.today, -27), end: ctx.today },
      why: "Regular resistance training is the main signal for keeping and building muscle while losing fat.",
      action: "Schedule the next two sessions in your calendar. Short sessions still count.",
      tone: "attention",
      area: "strength",
    });
  }

  /* ---- 8: strength progression ---- */
  const records = exerciseRecords(ctx.sessions, ctx.exercises, ctx.sets);
  const improving = records
    .map((rec) => {
      const pts = rec.progression.filter((p) => p.bestE1RM !== null && p.date > shiftDate(ctx.today, -56));
      if (pts.length < 3) return null;
      const first = pts[0].bestE1RM!;
      const last = pts[pts.length - 1].bestE1RM!;
      return { rec, first, last, pct: ((last - first) / first) * 100, n: pts.length, start: pts[0].date, end: pts[pts.length - 1].date };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.pct >= 5)
    .sort((a, b) => b.pct - a.pct);
  if (improving.length) {
    const top = improving[0];
    out.push({
      id: "strength-up",
      title: "Strength is improving",
      observation: `${top.rec.name}: estimated 1RM up ${r(top.pct)}%${improving.length > 1 ? `, plus ${improving.length - 1} other exercise${improving.length > 2 ? "s" : ""}` : ""}.`,
      evidence: `${top.first} kg → ${top.last} kg estimated (Epley) across ${top.n} sessions.`,
      range: { start: top.start, end: top.end },
      why: "Rising strength while weight is stable or falling is one of the clearest signs of successful recomposition.",
      action: "Keep progressing load or reps gradually; log every working set so the trend stays accurate.",
      tone: "positive",
      area: "strength",
    });
  }

  /* ---- 9: protein distribution across meals ---- */
  const start14 = shiftDate(ctx.today, -13);
  const recentFood = ctx.food.filter((f) => f.date >= start14 && f.date <= ctx.today && f.protein !== null);
  const loggedFoodDays = new Set(recentFood.map((f) => f.date)).size;
  if (loggedFoodDays >= MIN_LOGGED_DAYS) {
    const byMeal = new Map<MealCategory, number>();
    for (const f of recentFood) byMeal.set(f.mealCategory, (byMeal.get(f.mealCategory) ?? 0) + f.protein!);
    const total = [...byMeal.values()].reduce((a, b) => a + b, 0);
    const top = [...byMeal.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && total > 0 && top[1] / total >= 0.45 && byMeal.size >= 2) {
      const breakfast = byMeal.get("breakfast") ?? 0;
      out.push({
        id: "protein-distribution",
        title: "Protein is concentrated in one meal",
        observation: `${MEAL_LABELS[top[0]]} provides ${r((top[1] / total) * 100)}% of your protein.`,
        evidence: `${MEAL_CATEGORIES.filter((c) => byMeal.has(c))
          .map((c) => `${MEAL_LABELS[c]} ${r(((byMeal.get(c) ?? 0) / total) * 100)}%`)
          .join(", ")} across ${loggedFoodDays} logged days.`,
        range: { start: start14, end: ctx.today },
        why: "Spreading protein across meals (roughly 25–40 g each) is a common recommendation for supporting muscle protein synthesis.",
        action: breakfast / total < 0.15 ? "Add protein to breakfast first; it is currently the lightest." : "Move some protein from the largest meal to the lightest one.",
        tone: "neutral",
        area: "nutrition",
      });
    }
  }

  /* ---- 10: weekdays with incomplete logs ---- */
  const last56 = window(ctx.nutrition, ctx.today, 56);
  const overall = last56.filter((d) => d.logged).length / Math.max(1, last56.length);
  if (last56.length >= 28 && overall >= 0.5) {
    const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    const weak: string[] = [];
    for (let wd = 0; wd < 7; wd++) {
      const ds = last56.filter((d) => fromISODate(d.date).getDay() === wd);
      if (ds.length >= 4 && ds.filter((d) => d.logged).length / ds.length <= 0.25) weak.push(names[wd]);
    }
    if (weak.length) {
      out.push({
        id: "logging-gaps",
        title: "Some days are rarely logged",
        observation: `${weak.join(" and ")} are logged on 25% or fewer occasions.`,
        evidence: `Overall, ${r(overall * 100)}% of days in this period have a food log.`,
        range: range(last56),
        why: "Missing days make weekly averages less representative of what you actually eat.",
        action: `Set a reminder on ${weak[0]} evenings to paste that day's report.`,
        tone: "neutral",
        area: "logging",
      });
    }
  }

  return out;
}

/* ------------------------------------------------------ dashboard snippets */

export interface DailyObservation {
  id: string;
  text: string;
  tone: InsightTone;
}

/** Short statements for the Overview, each computed from stored records. */
export function dailyObservations(ctx: InsightContext, day: DayNutrition | null): DailyObservation[] {
  const out: DailyObservation[] = [];
  const g = goalsForDate(ctx.goals, ctx.today);
  if (day?.logged && g && day.totals.protein !== null) {
    const pctP = (day.totals.protein / g.protein) * 100;
    const met = targetMet("protein", day.totals.protein, g.protein);
    out.push({
      id: "protein-today",
      text: `Protein intake is ${r(pctP)}% of your daily target (${fmt(day.totals.protein, { decimals: 1 })} of ${g.protein} g).`,
      tone: met ? "positive" : "neutral",
    });
  }
  const fs = consecutiveBelowTarget(ctx.nutrition.filter((d) => d.date <= ctx.today), "fiber", ctx.goals, ctx.calorieTolerancePct);
  if (fs.count >= 3) {
    out.push({ id: "fiber-streak", text: `Fiber intake has been below target for ${fs.count} consecutive logged days.`, tone: "attention" });
  }
  const dw = ctx.weights;
  const cur = dw.filter((d) => d.date > shiftDate(ctx.today, -7) && d.date <= ctx.today);
  const prev = dw.filter((d) => d.date > shiftDate(ctx.today, -14) && d.date <= shiftDate(ctx.today, -7));
  if (cur.length >= 2 && prev.length >= 2) {
    const ch = mean(cur.map((d) => d.weightKg))! - mean(prev.map((d) => d.weightKg))!;
    if (Math.abs(ch) >= 0.05) {
      out.push({
        id: "weight-7d",
        text: `Your seven-day average weight has ${ch < 0 ? "decreased" : "increased"} by ${Math.abs(ch).toFixed(1)} kg.`,
        tone: "neutral",
      });
    }
  }
  const week = dateRange(shiftDate(ctx.today, -6), ctx.today);
  const steps = ctx.activity.filter((a) => week.includes(a.date) && a.steps !== null).map((a) => a.steps!);
  if (steps.length >= 3) {
    out.push({ id: "steps-week", text: `Your average daily steps over the last 7 days are ${fmt(mean(steps))} (${steps.length} days with data).`, tone: "neutral" });
  }
  return out;
}
