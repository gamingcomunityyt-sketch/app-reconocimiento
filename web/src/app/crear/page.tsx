import type { Metadata } from "next";

import { CreateFlow } from "@/components/create/CreateFlow";
import { PageTransition } from "@/components/ui/ViewTransition";

export const metadata: Metadata = {
  title: "Nuevo recuerdo · Recuerdos",
};

export default function CreatePage() {
  return (
    <PageTransition>
      <CreateFlow />
    </PageTransition>
  );
}
