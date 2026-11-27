import { createFileRoute } from "@tanstack/react-router";
import { TestBench } from "@/components/velomere-bench";

export const Route = createFileRoute("/deck/bench")({
  component: TestBench,
});
