import Link from "next/link";
import { notFound } from "next/navigation";
import type { BusinessType } from "@prisma/client";
import { detalleDeCuenta } from "@/lib/admin-queries";
import { BUSINESS_LABEL } from "@/lib/nav";
import { GRUPO_LABEL, type Grupo } from "@/lib/modules";
import { ROLE_LABEL } from "@/lib/staff";
import { reactivateAccountAction, toggleStaffAccessAction } from "@/actions/admin";
import { SuspenderForm } from "@/components/admin/SuspenderForm";
import { InterruptorModulo } from "@/components/admin/InterruptorModulo";
import { ReponerClave } from "@/components/ReponerClave";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

function fecha(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-200">{valor}</dd>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="mb-3 font-display text-sm text-slate-100">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function AdminCuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cuenta = await detalleDeCuenta(id);
  if (!cuenta) notFound();

  const todos = [
    { label: "Ventas", n: cuenta._count.sales },
    { label: "Gastos", n: cuenta._count.expenses },
    { label: "Productos", n: cuenta._count.services },
    { label: "Deudas", n: cuenta._count.debts },
    { label: "Turnos", n: cuenta._count.appointments },
    { label: "Cuentas abiertas", n: cuenta._count.orders },
    { label: "Tallas", n: cuenta._count.variants },
    { label: "Proveedores", n: cuenta._count.suppliers },
  ];
  const total = todos.reduce((s, m) => s + m.n, 0);
  // Solo lo que tiene algo. Un restaurante no necesita ver "Turnos: 0": eso no
  // es informacion, es ruido de una cosa que su oficio ni siquiera tiene.
  const movimientos = todos.filter((m) => m.n > 0);

  // Los apartados agrupados como en el configurador, para que se lean igual.
  const porGrupo = new Map<string, typeof cuenta.modulos>();
  for (const m of cuenta.modulos) {
    porGrupo.set(m.group, [...(porGrupo.get(m.group) ?? []), m]);
  }

  return (
    <>
      <Link href="/admin" className="text-xs text-slate-500 transition hover:text-slate-300">
        ← Todas las cuentas
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl text-slate-100">{cuenta.businessName}</h1>
          <p className="text-sm text-slate-400">
            {BUSINESS_LABEL[cuenta.businessType as BusinessType] ?? cuenta.businessType} ·{" "}
            {cuenta.ownerName}
          </p>
        </div>
        {cuenta.suspendedAt && (
          <span className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-300">
            Suspendida el {fecha(cuenta.suspendedAt)}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Bloque titulo="Datos de contacto">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dato label="Correo" valor={cuenta.email} />
              <Dato label="Teléfono" valor={cuenta.phone ?? "—"} />
              <Dato label="Se registró" valor={fecha(cuenta.createdAt)} />
              <Dato label="Último acceso" valor={fecha(cuenta.ultimoAcceso)} />
              <Dato label="Página pública" valor={cuenta.publicOpen ? "Abierta" : "Cerrada"} />
              <Dato label="Dirección" valor={"/catalogo/" + cuenta.slug} />
            </dl>

            {/* La salida para el cliente que no puede entrar y a quien el
                correo de recuperar no le llego. No muestra ninguna clave: lo
                que se genera es el enlace, y la escribe la persona. */}
            <div className="mt-4 border-t border-slate-800 pt-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                No puede entrar
              </p>
              <p className="mb-2 mt-1 text-[11px] leading-relaxed text-slate-500">
                Le manda a {cuenta.email} un enlace para que ponga una contraseña nueva. Tú no ves
                su contraseña en ningún momento.
              </p>
              <ReponerClave userId={cuenta.id} nombre={cuenta.ownerName} />
            </div>
          </Bloque>

          <Bloque titulo="Personas con acceso">
            <ul className="divide-y divide-slate-800">
              {cuenta.staff.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-100">{p.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {p.email ?? "sin correo, no entra"} · {ROLE_LABEL[p.role] ?? p.role}
                      {p.onboardingDoneAt ? "" : " · no terminó la bienvenida"}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {p.lastSeenAt ? "visto " + fecha(p.lastSeenAt) : "nunca entró"}
                  </span>
                  {p.email && p.active && (
                    <ReponerClave userId={cuenta.id} staffId={p.id} nombre={p.name} chico />
                  )}
                  {p.role === "DUENO" ? (
                    <span className="text-[11px] text-slate-600">dueño</span>
                  ) : (
                    <form action={toggleStaffAccessAction}>
                      <input type="hidden" name="staffId" value={p.id} />
                      <input type="hidden" name="userId" value={cuenta.id} />
                      <button
                        type="submit"
                        className={
                          "rounded-lg border px-2.5 py-1 text-[11px] font-bold transition " +
                          (p.active
                            ? "border-slate-700 text-slate-300 hover:border-rose-600 hover:text-rose-300"
                            : "border-emerald-800 text-emerald-300 hover:border-emerald-600")
                        }
                      >
                        {p.active ? "Quitar acceso" : "Devolver acceso"}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Bloque>

          <Bloque titulo="Qué tanto la usan">
            {total === 0 ? (
              <p className="text-sm text-slate-400">
                No ha registrado nada todavía. Se creó la cuenta y ahí quedó.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {movimientos.map((m) => (
                  <div key={m.label}>
                    <p className="font-display text-lg text-slate-100">{m.n}</p>
                    <p className="text-[11px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-600">
              Son cuántas cosas tiene registradas, no qué son. El contenido de la cuenta no se
              consulta desde aquí.
            </p>
          </Bloque>
        </div>

        <div className="space-y-4">
          <Bloque titulo={cuenta.suspendedAt ? "Cuenta suspendida" : "Suspender la cuenta"}>
            {cuenta.suspendedAt ? (
              <>
                <p className="text-sm text-slate-300">
                  Motivo: <span className="text-slate-100">{cuenta.suspendedReason}</span>
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Nadie de esta cuenta puede entrar. Sus datos siguen completos.
                </p>
                <form action={reactivateAccountAction} className="mt-3">
                  <input type="hidden" name="userId" value={cuenta.id} />
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-emerald-800 px-3 py-2 text-sm font-bold text-emerald-300 transition hover:border-emerald-600"
                  >
                    Reactivar cuenta
                  </button>
                </form>
              </>
            ) : (
              <SuspenderForm userId={cuenta.id} businessName={cuenta.businessName} />
            )}
          </Bloque>

          <Bloque titulo="Cómo leer los interruptores">
            <ul className="space-y-2 text-[12px] leading-snug text-slate-400">
              <li>
                <strong className="text-slate-200">De fábrica</strong> — la cuenta se queda con lo
                que le toca por su oficio. Es lo normal.
              </li>
              <li>
                <strong className="text-slate-200">Apagado</strong> — el apartado desaparece de su
                menú y no lo puede volver a prender desde adentro.
              </li>
              <li>
                <strong className="text-slate-200">Prendido</strong> — le entra encendido aunque de
                fábrica viniera apagado. Sirve para estrenarle algo a una cuenta.
              </li>
            </ul>
            <p className="mt-3 text-[11px] text-slate-600">
              Solo salen los apartados que su tipo de negocio tiene. No se le puede dar la agenda
              por hora a un restaurante ni desde aquí.
            </p>
          </Bloque>
        </div>
      </div>

      <h2 className="mt-8 font-display text-lg text-slate-100">Qué puede usar</h2>
      <p className="mt-1 text-sm text-slate-400">
        Y cuántos días distintos abrió cada cosa, para saber qué le sirve de verdad.
      </p>

      <div className="mt-4 space-y-5">
        {[...porGrupo.entries()].map(([grupo, modulos]) => (
          <div key={grupo}>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
              {GRUPO_LABEL[grupo as Grupo] ?? grupo}
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <ul className="divide-y divide-slate-800">
                {modulos.map((m) => (
                  <li
                    key={m.key}
                    className="flex flex-wrap items-center gap-3 bg-slate-900/40 px-4 py-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300">
                      <Icon name={m.icon} className="h-4 w-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-100">{m.label}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">
                        {m.short}
                      </span>
                    </span>

                    <span className="shrink-0 text-right text-[11px] text-slate-500">
                      {m.diasUsado === 0 ? (
                        <span className="text-slate-600">sin abrir</span>
                      ) : (
                        <>
                          <span className="block text-slate-300">
                            {m.diasUsado} {m.diasUsado === 1 ? "día" : "días"}
                          </span>
                          <span className="block">último {fecha(m.ultimaVez)}</span>
                        </>
                      )}
                    </span>

                    {m.fixed ? (
                      <span className="shrink-0 text-[11px] text-slate-600">siempre visible</span>
                    ) : (
                      <InterruptorModulo
                        userId={cuenta.id}
                        moduleKey={m.key}
                        label={m.label}
                        valor={m.override === null ? "sin_tocar" : m.override ? "prendido" : "apagado"}
                        deFabrica={m.deFabrica}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
