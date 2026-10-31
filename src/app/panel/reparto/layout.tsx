import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { esAdminDeChopo } from "@/lib/chopo";
import { PageHeader } from "@/components/ui";
import { RepartoNav } from "@/components/reparto/RepartoNav";

/**
 * Reparto: las planillas diarias de los vendedores de ruta (ver lib/reparto.ts).
 * Solo la administradora de Chopo Snacks: a quien no le toca, ni siquiera se
 * le dice que existe. Cada pagina y cada accion lo vuelven a mirar.
 */
export default async function RepartoLayout({ children }: { children: React.ReactNode }) {
  const { user, staff } = await requireSession();
  if (!esAdminDeChopo(user, staff)) notFound();
  return (
    <>
      <PageHeader title="Reparto" subtitle="Planillas diarias de los vendedores de ruta · Solo lo ves tú" />
      <RepartoNav />
      {children}
    </>
  );
}
