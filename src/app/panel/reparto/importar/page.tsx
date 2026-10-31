import { db } from "@/lib/db";
import { sesionDeReparto } from "@/lib/reparto-acceso";
import { Card } from "@/components/ui";
import { ImportarReparto } from "@/components/reparto/ImportarReparto";

export const dynamic = "force-dynamic";

/** Subir el Excel de reparto (el de octubre, o los que vengan con el mismo formato). */
export default async function ImportarRepartoPage() {
  const { user } = await sesionDeReparto();
  const equipo = await db.staff.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <Card
      title="Importar el Excel de reparto"
      subtitle="Cada hoja es un vendedor y cada día un bloque que empieza con VENDEDOR. Primero se revisa sin guardar nada; si todo cuadra al centavo, se importa."
    >
      <ImportarReparto equipo={equipo} currency={user.currency} />
    </Card>
  );
}
