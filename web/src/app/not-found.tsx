import Link from "next/link";

import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <EmptyState
        title="Esta pagina no existe"
        action={
          <Link href="/" className={buttonStyles("secondary")}>
            Volver a Recuerdos
          </Link>
        }
      />
    </div>
  );
}
