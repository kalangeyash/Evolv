import type { Metadata } from "next";
import { BodyView } from "@/components/views/body-view";

export const metadata: Metadata = { title: "Body Analytics" };

export default function Page() {
  return <BodyView />;
}
