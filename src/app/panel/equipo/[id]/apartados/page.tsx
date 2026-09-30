import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { GRUPO_LABEL, modulosDe, type Grupo } from "@/lib/modules";
import { esEmpleadoDeAsistencia, esLavadorDeLavadero } from "@/lib/permisos";
import { etiquetaDeRol } from "@/lib/staff";
import { apartadosComoElNegocioAction, guardarApartadosEmpleadoAction } from "@/actions/staff";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const ORDEN: Grupo[] = ["NUCLEO", "DINERO", "CRECIMIENTO", "CONFIGURACION", "FIJO"];

/**
 * Que puede usar un empleado: el dueño prende y apaga cada apartado para esa
 * persona. Ventas, Marcar asistencia, Reportes... lo que le toque a cada uno.
 * Lo apagado no sale en su menu y tampoco se abre escribiendo la direccion.
 */
export default async function ApartadosEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireOwner();
  const { id } = await params;
  const persona = await db.staff.findFirst({
    where: { id, userId: user.id, role: { not: "DUENO" } },
    select: { id: true, name: true, role: true, workspace: { select: { id: true } } },
  });
  if (!persona) notFound();

  const encabezado = (
    <PageHeader title={"Qué puede usar " + persona.name} subtitle={etiquetaDeRol(persona.role, user.businessType)}>
      <Link href="/panel/equipo" className="btn-ghost btn-sm">
        Volver al equipo
      </Link>
    </PageHeader>
  );

  // El empleado del gestor de asistencia y el lavador tienen un menu fijo de
  // pocas pantallas (lib/permisos.ts): ese no se arma aqui.
  if (esEmpleadoDeAsistencia(user, persona) || esLavadorDeLavadero(user, persona)) {
    return (
      <>
        {encabezado}
        <Card>
          <p className="text-sm text-muted">
            {persona.name} tiene un menú fijo para su trabajo: marcar su entrada y salida, y sus pantallas propias. No
            hace falta configurarlo.
          </p>
        </Card>
      </>
    );
  }

  const modulos = await modulosDe({ user, staff: persona });
  const propio = Boolean(persona.workspace);

  return (
    <>
      {encabezado}
      <Card
        title="Apartados"
        subtitle={
          propio
            ? "Menú propio de " + persona.name + ". Lo que apagues no le sale y no lo puede abrir."
            : "Hoy usa el mismo menú del negocio. Al guardar, " + persona.name + " queda con su propio menú."
        }
      >
        <form action={guardarApartadosEmpleadoAction} className="space-y-5" data-apartados-empleado>
          <input type="hidden" name="staffId" value={persona.id} />
          {ORDEN.map((grupo) => {
            const delGrupo = modulos.filter((m) => m.group === grupo);
            if (delGrupo.length === 0) return null;
            return (
              <fieldset key={grupo}>
                <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">
                  {GRUPO_LABEL[grupo]}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {delGrupo.map((m) => (
                    <label
                      key={m.key}
                      className={
                        "flex items-start gap-3 rounded-xl border border-line bg-surface p-3 " +
                        (m.fixed ? "opacity-70" : "cursor-pointer hover:border-brand-500")
                      }
                    >
                      <input
                        type="checkbox"
                        name="key"
                        value={m.key}
                        defaultChecked={m.visible}
                        disabled={m.fixed}
                        className="mt-0.5 h-4 w-4 accent-brand-600"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-strong">
                          <Icon name={m.icon} className="h-4 w-4 text-subtle" />
                          {m.label}
                          {m.fixed && <span className="text-[11px] font-normal text-subtle">(siempre)</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{m.short}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          <SubmitButton className="btn-primary" pendingText="Guardando...">
            Guardar lo que puede usar
          </SubmitButton>
        </form>
      </Card>

      {propio && (
        <form action={apartadosComoElNegocioAction} className="mt-3">
          <input type="hidden" name="staffId" value={persona.id} />
          <SubmitButton
            className="btn-ghost btn-sm"
            pendingText="..."
            confirm={persona.name + " vuelve a usar el mismo menú del negocio."}
          >
            Volver al menú del negocio
          </SubmitButton>
        </form>
      )}
    </>
  );
}
