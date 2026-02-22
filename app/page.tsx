import KnowledgeBase from "./knowledge-base";
import { Toaster } from "@/components/ui/toaster";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <KnowledgeBase />
      <Toaster />
    </main>
  );
}
