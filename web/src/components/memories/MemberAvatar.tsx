import type { MemberRole } from "@/types/domain";
import type { MemberView } from "@/lib/data";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Puede gestionar",
  editor: "Puede editar",
  viewer: "Puede ver",
};

export function roleLabel(role: MemberRole): string {
  return ROLE_LABEL[role];
}

/** Tonos calidos dentro de la paleta, elegidos de forma estable por nombre. */
const TINTS = [
  "bg-[#c8a48b] text-[#2b1c11]",
  "bg-[#a8b39c] text-[#1e2519]",
  "bg-[#c4a2a2] text-[#2d1717]",
  "bg-[#a7adbd] text-[#181c26]",
  "bg-[#cbb682] text-[#2a2210]",
];

function tintFor(name: string): string {
  let hash = 0;
  for (const character of name) {
    hash = (hash + character.codePointAt(0)!) % TINTS.length;
  }
  return TINTS[hash];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * Iniciales en lugar de fotografia: no hace falta descargar un avatar por
 * persona para decir quien tiene acceso, y nunca falla al cargar.
 */
export function MemberAvatar({ member }: { member: MemberView }) {
  return (
    <span
      title={`${member.name} · ${ROLE_LABEL[member.role]}`}
      className={`grid size-9 place-items-center rounded-full text-meta font-semibold ring-2 ring-surface ${tintFor(member.name)}`}
    >
      <span aria-hidden>{initials(member.name)}</span>
      <span className="sr-only">
        {member.name}, {ROLE_LABEL[member.role]}
      </span>
    </span>
  );
}
