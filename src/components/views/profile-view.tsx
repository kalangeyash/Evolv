"use client";
import * as React from "react";
import Link from "next/link";
import type { ActivityLevel, ExperienceLevel, Sex, UserProfile } from "@/lib/db/types";
import { useGoals, useMeasurements, useProfile, useWeights } from "@/hooks/use-data";
import { useAction } from "@/hooks/use-action";
import { updateProfile, ValidationError } from "@/lib/db/repos";
import { ACTIVITY_FACTORS, profileAge } from "@/lib/analytics/energy";
import { goalsForDate } from "@/lib/analytics/goals";
import { measurementChanges } from "@/lib/analytics/body";
import { formatDay, isISODate, todayISO } from "@/lib/utils/dates";
import { cmToFeetInches, feetInchesToCm, fmt, formatHeight } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea, numToInput, parseInputNumber } from "@/components/ui/input";
import { MEASUREMENT_LABEL } from "@/lib/utils/format";

type Form = Record<string, string>;

function toForm(p: UserProfile): Form {
  const fi = p.heightCm ? cmToFeetInches(p.heightCm) : null;
  return {
    displayName: p.displayName ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
    ageYears: numToInput(p.ageYears),
    sex: p.sex ?? "",
    heightCm: numToInput(p.heightCm),
    feet: fi ? String(fi.feet) : "",
    inches: fi ? String(fi.inches) : "",
    primaryGoal: p.primaryGoal,
    secondaryGoals: p.secondaryGoals.join("\n"),
    activityDevice: p.activityDevice ?? "",
    country: p.country ?? "",
    timezone: p.timezone,
    currency: p.currency,
    fitnessExperience: p.fitnessExperience ?? "",
    activityLevel: p.activityLevel ?? "",
    dietaryPreferences: p.dietaryPreferences ?? "",
    foodAllergies: p.foodAllergies ?? "",
    foodRestrictions: p.foodRestrictions ?? "",
    workoutPreferences: p.workoutPreferences ?? "",
    targetTimeline: p.targetTimeline ?? "",
  };
}

export function ProfileView() {
  const profile = useProfile();
  const weights = useWeights();
  const measurements = useMeasurements();
  const goals = useGoals();
  const { run, busy } = useAction();
  const [f, setF] = React.useState<Form | null>(null);
  React.useEffect(() => {
    if (profile && !f) setF(toForm(profile));
  }, [profile, f]);
  if (!profile || !f || !weights || !measurements || !goals) return <LoadingBlock />;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p!, [k]: e.target.value }));
  const setHeightCm = (v: string) => {
    const cm = parseInputNumber(v);
    const fi = cm && Number.isFinite(cm) ? cmToFeetInches(cm) : null;
    setF((p) => ({ ...p!, heightCm: v, feet: fi ? String(fi.feet) : p!.feet, inches: fi ? String(fi.inches) : p!.inches }));
  };
  const setFeetInches = (feet: string, inches: string) => {
    const ft = parseInputNumber(feet);
    const inch = parseInputNumber(inches) ?? 0;
    setF((p) => ({ ...p!, feet, inches, heightCm: ft && Number.isFinite(ft) && Number.isFinite(inch) ? String(feetInchesToCm(ft, inch)) : p!.heightCm }));
  };

  const save = async () => {
    const opt = (s: string) => (s.trim() ? s.trim() : null);
    const height = parseInputNumber(f.heightCm);
    const age = parseInputNumber(f.ageYears);
    await run(async () => {
      if (height !== null && !Number.isFinite(height)) throw new ValidationError("Height must be a number.");
      if (age !== null && !Number.isFinite(age)) throw new ValidationError("Age must be a number.");
      if (f.dateOfBirth && !isISODate(f.dateOfBirth)) throw new ValidationError("Enter a valid date of birth.");
      if (f.dateOfBirth && f.dateOfBirth > todayISO()) throw new ValidationError("Date of birth cannot be in the future.");
      if (!f.primaryGoal.trim()) throw new ValidationError("Primary goal is required.");
      await updateProfile({
        displayName: opt(f.displayName),
        dateOfBirth: opt(f.dateOfBirth),
        ageYears: age,
        sex: (opt(f.sex) as Sex | null) ?? null,
        heightCm: height,
        primaryGoal: f.primaryGoal.trim(),
        secondaryGoals: f.secondaryGoals.split("\n").map((s) => s.trim()).filter(Boolean),
        activityDevice: opt(f.activityDevice),
        country: opt(f.country),
        timezone: f.timezone.trim() || "Asia/Kolkata",
        currency: f.currency.trim() || "INR",
        fitnessExperience: (opt(f.fitnessExperience) as ExperienceLevel | null) ?? null,
        activityLevel: (opt(f.activityLevel) as ActivityLevel | null) ?? null,
        dietaryPreferences: opt(f.dietaryPreferences),
        foodAllergies: opt(f.foodAllergies),
        foodRestrictions: opt(f.foodRestrictions),
        workoutPreferences: opt(f.workoutPreferences),
        targetTimeline: opt(f.targetTimeline),
      });
    }, "Profile saved");
  };

  const latest = weights.at(-1);
  const g = goalsForDate(goals, todayISO());
  const meas = measurementChanges(measurements).filter((m) => m.latest);
  const age = profileAge(profile, todayISO());

  return (
    <div>
      <PageHeader title="Profile" description="Only what you enter is stored. Blank fields stay blank; EVOLV never fills in details for you." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <Card>
            <CardHeader title="About you" />
            <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Display name" htmlFor="p-name" className="col-span-2">
                <Input id="p-name" value={f.displayName} onChange={set("displayName")} />
              </Field>
              <Field label="Date of birth" htmlFor="p-dob">
                <Input id="p-dob" type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} />
              </Field>
              <Field label="Age" htmlFor="p-age" hint={f.dateOfBirth ? "Calculated from date of birth" : "Used if no date of birth"}>
                <Input id="p-age" inputMode="numeric" value={f.dateOfBirth && age !== null ? String(age) : f.ageYears} disabled={!!f.dateOfBirth} onChange={set("ageYears")} />
              </Field>
              <Field label="Sex (optional)" htmlFor="p-sex" hint="Only used for the maintenance formula" className="col-span-2">
                <Select id="p-sex" value={f.sex} onChange={set("sex")}>
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <div className="col-span-2">
                <p className="mb-1.5 text-[13px] font-medium text-muted">Height</p>
                <div className="flex items-center gap-2">
                  <Input aria-label="Feet" inputMode="numeric" value={f.feet} onChange={(e) => setFeetInches(e.target.value, f.inches)} className="w-16" />
                  <span className="text-muted">ft</span>
                  <Input aria-label="Inches" inputMode="numeric" value={f.inches} onChange={(e) => setFeetInches(f.feet, e.target.value)} className="w-16" />
                  <span className="text-muted">in</span>
                  <Input aria-label="Centimetres" inputMode="decimal" value={f.heightCm} onChange={(e) => setHeightCm(e.target.value)} className="w-24" />
                  <span className="text-muted">cm</span>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Goals and training" />
            <CardBody className="grid grid-cols-2 gap-3">
              <Field label="Primary goal" htmlFor="p-goal" className="col-span-2 sm:col-span-1">
                <Input id="p-goal" value={f.primaryGoal} onChange={set("primaryGoal")} />
              </Field>
              <Field label="Target timeline" htmlFor="p-timeline" className="col-span-2 sm:col-span-1">
                <Input id="p-timeline" value={f.targetTimeline} onChange={set("targetTimeline")} placeholder="e.g. 6 months" />
              </Field>
              <Field label="Secondary goals (one per line)" htmlFor="p-sec" className="col-span-2">
                <Textarea id="p-sec" rows={4} value={f.secondaryGoals} onChange={set("secondaryGoals")} />
              </Field>
              <Field label="Fitness experience" htmlFor="p-exp">
                <Select id="p-exp" value={f.fitnessExperience} onChange={set("fitnessExperience")}>
                  <option value="">Not set</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </Select>
              </Field>
              <Field label="Daily activity level" htmlFor="p-act">
                <Select id="p-act" value={f.activityLevel} onChange={set("activityLevel")}>
                  <option value="">Not set</option>
                  {Object.entries(ACTIVITY_FACTORS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Workout preferences" htmlFor="p-wp" className="col-span-2">
                <Input id="p-wp" value={f.workoutPreferences} onChange={set("workoutPreferences")} />
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Food" />
            <CardBody className="grid gap-3 sm:grid-cols-3">
              <Field label="Dietary preferences" htmlFor="p-diet">
                <Input id="p-diet" value={f.dietaryPreferences} onChange={set("dietaryPreferences")} placeholder="e.g. Eggetarian" />
              </Field>
              <Field label="Food allergies" htmlFor="p-allergy">
                <Input id="p-allergy" value={f.foodAllergies} onChange={set("foodAllergies")} />
              </Field>
              <Field label="Food restrictions" htmlFor="p-restr">
                <Input id="p-restr" value={f.foodRestrictions} onChange={set("foodRestrictions")} />
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Region and device" />
            <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Activity device" htmlFor="p-dev">
                <Input id="p-dev" value={f.activityDevice} onChange={set("activityDevice")} />
              </Field>
              <Field label="Country" htmlFor="p-country">
                <Input id="p-country" value={f.country} onChange={set("country")} />
              </Field>
              <Field label="Timezone" htmlFor="p-tz">
                <Input id="p-tz" value={f.timezone} onChange={set("timezone")} />
              </Field>
              <Field label="Currency" htmlFor="p-cur">
                <Input id="p-cur" value={f.currency} onChange={set("currency")} />
              </Field>
            </CardBody>
          </Card>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setF(toForm(profile))}>
              Discard changes
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              Save profile
            </Button>
          </div>
        </form>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Current body data" description="Recorded over time in Body Analytics, so history is kept." />
            <CardBody className="space-y-2 text-[13.5px]">
              <p className="flex justify-between">
                <span className="text-muted">Weight</span>
                <span className="tabular font-medium">{latest ? `${latest.weightKg} kg (${formatDay(latest.date, "d MMM")})` : "—"}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted">Height</span>
                <span className="tabular font-medium">{formatHeight(profile.heightCm)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted">Target weight</span>
                <span className="tabular font-medium">{g?.targetWeightKg ? `${g.targetWeightKg} kg` : "—"}</span>
              </p>
              {meas.map((m) => (
                <p key={m.key} className="flex justify-between">
                  <span className="text-muted">{MEASUREMENT_LABEL[m.key]}</span>
                  <span className="tabular font-medium">
                    {fmt(m.latest!.value, { decimals: 1 })}
                    {m.key === "bodyFatPct" ? "%" : " cm"}
                  </span>
                </p>
              ))}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/body/">Log weight or measurements</Link>
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/goals/">Edit targets</Link>
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
