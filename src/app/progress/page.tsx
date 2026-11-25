import type { Metadata } from "next";
import { ProgressView } from "@/components/views/progress-view";

export const metadata: Metadata = { title: "Progress & Insights" };

export default function Page() {
  return <ProgressView />;
}
