import type { MemorySummary } from "@/lib/data";

import { MemoryCard } from "./MemoryCard";

/**
 * Dos columnas en el telefono, que es donde se usa. Se ensancha en tablet y
 * escritorio sin dejar de ser una rejilla de fotografias: nunca una tabla.
 */
export function MemoryGrid({ memories }: { memories: MemorySummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {memories.map((memory, index) => (
        <li key={memory.id}>
          <MemoryCard memory={memory} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}
