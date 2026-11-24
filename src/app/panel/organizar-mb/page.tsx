import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { esMbNails } from "@/lib/mb-nails";
import { MANICURISTAS_MB, planDeOrganizar } from "@/lib/mb-nails-plan";
import { normalizar } from "@/lib/orden-productos";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { FormOrganizar } from "@/components/FormOrganizar";

export const dynamic = "force-dynamic";

/**
 * Organizar MB Nails: la dueña ve lo que se va a hacer en su cuenta y lo
 * aplica con un boton (ver lib/mb-nails-plan.ts). Se puede abrir otra vez:
 * lo que ya esta hecho sale como listo.
 */
export default async function OrganizarMbPage() {
  const { user } = await requireOwner();
  if (!esMbNails(user.businessName)) redirect("/panel");

  const [existentes, equipo, usuariosTomados] = await Promise.all([
    db.service.findMany({ where: { userId: user.id }, select: { id: true, name: true, price: true, category: true } }),
    db.staff.findMany({ where: { userId: user.id, deletedAt: null }, select: { name: true } }),
    db.staff.findMany({ where: { username: { in: MANICURISTAS_MB.map((m) => m.username) } }, select: { username: true } }),
  ]);
  const plan = planDeOrganizar(existentes);
  const yaEstan = new Set(equipo.map((s) => normalizar(s.name)));
  const manicuristas = MANICURISTAS_MB.map((m) => ({
    ...m,
    esta: yaEstan.has(normalizar(m.name)),
    usuarioLibre: !usuariosTomados.some((t) => t.username === m.username),
  }));
  const agenda = user.businessType === "BARBERIA";
  const hayAlgo =
    !agenda || plan.mover.length > 0 || plan.precios.length > 0 || plan.faltan.length > 0 || manicuristas.some((m) => !m.esta);

  const Listo = ({ children }: { children: React.ReactNode }) => (
    <p className="flex items-center gap-2 text-sm text-good">
      <Icon name="check" className="h-4 w-4 shrink-0" />
      {children}
    </p>
  );

  return (
    <>
      <PageHeader title="Organizar MB Nails" subtitle="Revisa lo que se va a hacer en tu cuenta y toca Aplicar">
        <Link href="/panel" className="btn-ghost btn-sm">
          Volver
        </Link>
      </PageHeader>

      <FormOrganizar hayAlgo={hayAlgo}>
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Card title="1. Agenda de citas" subtitle="Citas por manicurista, con reserva en línea para tus clientas">
            {agenda ? (
              <Listo>La agenda ya está activa.</Listo>
            ) : (
              <p className="text-sm text-body" data-plan-agenda>
                Se activa la agenda. Tu menú queda con <strong>Agenda, Ventas, Gastos y Cierre</strong>, y tus ventas, gastos y
                clientes no se tocan.
              </p>
            )}
          </Card>

          <Card title="2. Manicuristas" subtitle="Cada una entra escribiendo solo su usuario">
            <ul className="space-y-1.5 text-sm" data-plan-manicuristas>
              {manicuristas.map((m) => (
                <li key={m.username} className="flex items-baseline justify-between gap-2">
                  <span className="text-strong">{m.name}</span>
                  <span className={"text-xs " + (m.esta ? "text-good" : "text-muted")}>
                    {m.esta ? "Ya está" : m.usuarioLibre ? "Se crea · usuario " + m.username : "Se crea sin usuario (ese ya lo tiene otra cuenta)"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="3. Cada producto en su categoría" subtitle="Uñas, Depilación con cera, Pestañas, Capilares, Bebidas y Mecato. Bebidas y Mecato no salen en la reserva en línea.">
            {plan.mover.length === 0 ? (
              <Listo>No hay nada en General por acomodar.</Listo>
            ) : (
              <>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-strong">
                  <input type="checkbox" name="mover" defaultChecked className="h-4 w-4" />
                  Pasar estos {plan.mover.length} de General a su categoría
                </label>
                <ul className="max-h-72 space-y-1 overflow-y-auto text-sm" data-plan-mover>
                  {plan.mover.map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-body">{m.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-brand-700">→ {m.a}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="4. Precios de la lista" subtitle="Los que ya tienes con el mismo nombre y otro precio">
            {plan.precios.length === 0 ? (
              <Listo>Los precios ya coinciden.</Listo>
            ) : (
              <>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-strong">
                  <input type="checkbox" name="precios" defaultChecked className="h-4 w-4" />
                  Poner el precio de la lista
                </label>
                <ul className="space-y-1 text-sm">
                  {plan.precios.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-body">{p.name}</span>
                      <span className="shrink-0 text-xs">
                        {money(p.de, user.currency)} → <strong>{money(p.a, user.currency)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <Card title="5. Lo que falta de tus listas" subtitle="Desmarca lo que ya tengas con otro nombre">
          {plan.faltan.length === 0 ? (
            <Listo>Ya tienes todo lo de la lista de precios y la de mecato.</Listo>
          ) : (
            <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-plan-faltan>
              {plan.faltan.map(({ item, parecido }) => (
                <li key={item.name}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name="agregar" value={normalizar(item.name)} defaultChecked={!parecido} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="text-strong">{item.name}</span>{" "}
                      <span className="text-muted">
                        · {item.category} · {money(item.price, user.currency)}
                      </span>
                      {parecido && <span className="block text-xs text-warn">Parece que ya lo tienes: {parecido}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!hayAlgo && (
          <div className="flex flex-wrap gap-2">
            <Link href="/panel/turnos" className="btn-primary">
              <Icon name="calendar" className="h-4 w-4" />
              Ir a la agenda
            </Link>
            <Link href="/panel/equipo" className="btn-ghost">
              <Icon name="users" className="h-4 w-4" />
              Ver manicuristas
            </Link>
          </div>
        )}
      </FormOrganizar>
    </>
  );
}
