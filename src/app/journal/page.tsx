import type { Metadata } from "next";
import { JournalView } from "@/components/views/journal-view";

export const metadata: Metadata = { title: "Food Journal" };

export default function Page() {
  return <JournalView />;
}
