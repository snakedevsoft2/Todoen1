import Link from "next/link";
import { listaDeCuentas, resumenPlataforma } from "@/lib/admin-queries";
import { BUSINESS_LABEL } from "@/lib/nav";
import { Icon } from "@/components/Icon";
import type { BusinessType } from "@prisma/client";

export const dynamic = "force-dynamic";

/** "hace 3 dias", "hoy", "nunca". Un timestamp crudo no dice nada de un vistazo. */
function haceCuanto(fecha: Date | null): { texto: string; tono: string } {
  if (!fecha) return { texto: "Nunca entró", tono: "text-rose-400" };
  const horas = (Date.now() - fecha.getTime()) / 3_600_000;
  if (horas < 1) return { texto: "Ahora mismo", tono: "text-emerald-400" };
  if (horas < 24) return { texto: "Hoy", tono: "text-emerald-400" };
  const dias = Math.floor(horas / 24);
  if (dias === 1) return { texto: "Ayer", tono: "text-slate-300" };
  if (dias < 30) return { texto: "Hace " + dias + " días", tono: "text-slate-400" };
  const meses = Math.floor(dias / 30);
  return { texto: "Hace " + meses + (meses === 1 ? " mes" : " meses"), tono: "text-amber-400" };
}

function Numero({
  label,
  valor,
  pie,
  tono = "text-slate-100",
}: {
  label: string;
  valor: number;
  pie?: string;
  tono?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={"font-display text-2xl leading-tight " + tono}>{valor}</p>
      {pie && <p className="text-[11px] text-slate-500">{pie}</p>}
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [resumen, cuentas] = await Promise.all([resumenPlataforma(), listaDeCuentas(q)]);

  return (
    <>
      <h1 className="font-display text-xl text-slate-100">Cuentas</h1>
      <p className="mt-1 text-sm text-slate-400">
        Quién se registró, quién sigue entrando y qué le puedes prender o apagar.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Numero label="Negocios" valor={resumen.negocios} pie="registrados en total" />
        <Numero
          label="Activos hoy"
          valor={resumen.activosHoy}
          pie="personas que entraron"
          tono="text-emerald-400"
        />
        <Numero label="Esta semana" valor={resumen.activos7} pie="últimos 7 días" />
        <Numero label="Este mes" valor={resumen.activos30} pie="últimos 30 días" />
        <Numero
          label="Nunca entraron"
          valor={resumen.dormidos}
          pie="se registraron y ya"
          tono={resumen.dormidos > 0 ? "text-rose-400" : "text-slate-100"}
        />
        <Numero
          label="Suspendidas"
          valor={resumen.suspendidos}
          pie="no pueden entrar"
          tono={resumen.suspendidos > 0 ? "text-amber-400" : "text-slate-100"}
        />
      </div>

      {resumen.dormidos > 0 && (
        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
          <strong className="text-slate-100">{resumen.dormidos}</strong>{" "}
          {resumen.dormidos === 1 ? "negocio se registró" : "negocios se registraron"} y nunca
          entraron. Es el número que más dice: no es que la app les falle, es que no llegaron a
          probarla. Vale la pena escribirles.
        </p>
      )}

      <form method="get" className="mt-6 flex gap-2">
        <span className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por negocio, correo o nombre del dueño"
            className="w-full rounded-lg border border-slate-800 bg-slate-900/60 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
          />
        </span>
        <button
          type="submit"
          className="rounded-lg border border-slate-700 px-4 text-sm font-bold text-slate-200 transition hover:border-slate-500"
        >
          Buscar
        </button>
      </form>

      {cuentas.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
          {q ? "Ninguna cuenta coincide con esa búsqueda." : "Todavía no hay cuentas registradas."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-bold">Negocio</th>
                <th className="px-4 py-2.5 font-bold">Correo</th>
                <th className="px-4 py-2.5 font-bold">Personas</th>
                <th className="px-4 py-2.5 font-bold">Último acceso</th>
                <th className="px-4 py-2.5 font-bold">Movimientos</th>
                <th className="px-4 py-2.5 font-bold">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cuentas.map((c) => {
                const visto = haceCuanto(c.ultimoAcceso);
                return (
                  <tr key={c.id} className="transition hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <span className="block font-bold text-slate-100">{c.businessName}</span>
                      <span className="block text-[11px] text-slate-500">
                        {BUSINESS_LABEL[c.businessType as BusinessType] ?? c.businessType} · desde{" "}
                        {c.createdAt.toISOString().slice(0, 10)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-slate-300">{c.email}</span>
                      {c.phone && (
                        <span className="block text-[11px] text-slate-500">{c.phone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {c.conAcceso}
                      <span className="text-[11px] text-slate-600"> de {c.personas}</span>
                    </td>
                    <td className={"px-4 py-3 " + visto.tono}>{visto.texto}</td>
                    <td className="px-4 py-3 text-slate-300">{c.movimientos}</td>
                    <td className="px-4 py-3">
                      {c.suspendedAt ? (
                        <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                          Suspendida
                        </span>
                      ) : c.apagados > 0 ? (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                          {c.apagados} apagado{c.apagados === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-600">Normal</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={"/admin/" + c.id}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
