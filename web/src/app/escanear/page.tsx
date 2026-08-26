import type { Metadata } from "next";

import { ScanExperience } from "@/components/scan/ScanExperience";
import { listScanCandidates, parseForcedOutcome } from "@/lib/data";

function parseDebugFlag(value: string | string[] | undefined): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "1" || candidate === "true";
}

export const metadata: Metadata = {
  title: "Escanear · Recuerdos",
};

/**
 * Sin `PageTransition`: la camara ocupa la pantalla completa y deslizarla
 * lateralmente al entrar y salir marea mas de lo que aporta.
 */
export default async function ScanPage(props: PageProps<"/escanear">) {
  const [candidates, searchParams] = await Promise.all([
    listScanCandidates(),
    props.searchParams,
  ]);

  return (
    <ScanExperience
      candidates={candidates}
      forced={parseForcedOutcome(searchParams.resultado)}
      debug={parseDebugFlag(searchParams.debug)}
    />
  );
}
