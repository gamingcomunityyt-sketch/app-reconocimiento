import type { Metadata } from "next";

import { MemoryDetailScreen } from "@/components/memories/MemoryDetailScreen";
import { SessionMemoryDetail } from "@/components/memories/SessionMemoryDetail";
import { PageTransition } from "@/components/ui/ViewTransition";
import { getMemory } from "@/lib/data";

export async function generateMetadata(
  props: PageProps<"/recuerdo/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const memory = await getMemory(id);
  return { title: memory ? `${memory.title} · Recuerdos` : "Recuerdos" };
}

export default async function MemoryPage(props: PageProps<"/recuerdo/[id]">) {
  const { id } = await props.params;
  const memory = await getMemory(id);

  return (
    <PageTransition>
      {memory ? (
        <MemoryDetailScreen id={id} initialMemory={memory} />
      ) : (
        <SessionMemoryDetail id={id} />
      )}
    </PageTransition>
  );
}
