import { createFileRoute } from "@tanstack/react-router";
import { ReadingTable } from "@/components/reading-table";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ReadingTable />;
}
