import type { Metadata } from "next";
import { ImportView } from "@/components/views/import-view";

export const metadata: Metadata = { title: "Import Daily Report" };

export default function Page() {
  return <ImportView />;
}
