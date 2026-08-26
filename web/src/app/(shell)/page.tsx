import { LibraryView } from "@/components/memories/LibraryView";
import { PageTransition } from "@/components/ui/ViewTransition";
import { listMemories } from "@/lib/data";

export default async function LibraryPage() {
  const memories = await listMemories();

  return (
    <PageTransition>
      <LibraryView memories={memories} />
    </PageTransition>
  );
}
