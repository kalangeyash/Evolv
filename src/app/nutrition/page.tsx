import type { Metadata } from "next";
import { NutritionView } from "@/components/views/nutrition-view";

export const metadata: Metadata = { title: "Nutrition" };

export default function Page() {
  return <NutritionView />;
}
