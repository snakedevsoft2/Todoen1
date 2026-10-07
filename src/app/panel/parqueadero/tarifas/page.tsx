import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { asegurarTarifas, tieneParqueadero } from "@/lib/parqueadero";
import { cobroDe, rangoTexto, tarifaEnPalabras } from "@/lib/parqueadero-tarifa";
import { alternarTarifaAction } from "@/actions/parqueadero";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { TarifaForm } from "@/components/parqueadero/TarifaForm";

export const dynamic = "force-dynamic";

/** Cuanto cobra el parqueadero, por tipo de vehiculo. Lo que se ve al cliente sale de aqui. */
const EJEMPLOS = [
  { label: "30 min", min: 30 },
  { label: "1 hora", min: 60 },
  { label: "3 horas", min: 180 },
  { label: "8 horas", min: 480 },
  { label: "1 día", min: 1440 },
];

export default async function TarifasPage() {
  const { user } = await requireOwner();
  if (!tieneParqueadero(user.businessType)) redirect("/panel");
  await asegurarTarifas(user.id);

  const tarifas = await db.parkingRate.findMany({
    where: { userId: user.id },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Tarifas del parqueadero"
        subtitle="Cuánto cobras por hora y por día. El cliente lo ve en su ticket y en el QR."
      >
        <Link href="/panel/parqueadero" className="btn-ghost btn-sm">
          Volver al parqueadero
        </Link>
      </PageHeader>

      <p className="mb-4 text-sm text-muted">
        Si cambias un precio, los vehículos que ya están adentro siguen con la tarifa de su ticket. Los que entren
        después pagan la nueva.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {tarifas.map((t) => (
          <Card
            key={t.id}
            title={t.name}
            subtitle={rangoTexto(t, user.currency) || "Sin precio"}
            action={
              <div className="flex items-center gap-2">
                <Badge tone={t.active ? "green" : "slate"}>{t.active ? "Activa" : "Apagada"}</Badge>
                <form action={alternarTarifaAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                    {t.active ? "Apagar" : "Prender"}
                  </SubmitButton>
                </form>
              </div>
            }
          >
            <div className="mb-4 rounded-xl border border-line bg-surface p-3" data-vista-cliente>
              <p className="eyebrow">Así lo ve tu cliente</p>
              <p className="mt-1 text-sm text-strong">{tarifaEnPalabras(t, user.currency).join(" · ")}</p>
              <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                {EJEMPLOS.map((e) => (
                  <div key={e.min} className="rounded-lg bg-panel px-1 py-1.5">
                    <p className="text-[10px] text-subtle">{e.label}</p>
                    <p className="text-xs font-bold text-strong">{money(cobroDe(t, e.min), user.currency)}</p>
                  </div>
                ))}
              </div>
            </div>
            <TarifaForm
              tarifa={{
                id: t.id,
                name: t.name,
                pricePerHour: t.pricePerHour,
                fractionMinutes: t.fractionMinutes,
                graceMinutes: t.graceMinutes,
                pricePerDay: t.pricePerDay,
              }}
              currency={user.currency}
            />
          </Card>
        ))}

        <Card title="Agregar otro tipo de vehículo" subtitle="Camioneta, bicicleta, bus...">
          <TarifaForm currency={user.currency} />
        </Card>
      </div>
    </>
  );
}
