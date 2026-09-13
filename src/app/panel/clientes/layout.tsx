import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { filtroDeSeguimientos } from "@/lib/crm-filas";
import { PageHeader } from "@/components/ui";
import { CrmTabs } from "@/components/CrmTabs";

export default async function ClientesLayout({ children }: { children: React.ReactNode }) {
  const { user, staff } = await requireSession();
  const hoy = todayIn(user.timezone);

  // El numero rojo de la pestaña: lo de hoy y lo atrasado, no lo de la otra semana.
  const pendientes = await db.followUp.count({
    where: { userId: user.id, doneAt: null, dueDay: { lte: hoy }, ...filtroDeSeguimientos(staff) },
  });

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Quién te compra, qué tienes pendiente con cada uno y en qué va cada venta"
      />
      <CrmTabs pendientes={pendientes} />
      {children}
    </>
  );
}
