import type { Metadata } from "next";
import { WorkoutsView } from "@/components/views/workouts-view";

export const metadata: Metadata = { title: "Workouts" };

export default function Page() {
  return <WorkoutsView />;
}
