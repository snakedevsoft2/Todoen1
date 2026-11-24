import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { pretty12h, shortDay } from "@/lib/format";
import { prettyPhone, waLink } from "@/lib/whatsapp";
import { esManicuristaDeMbNails } from "@/lib/mb-nails";
import { Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const POR_PAGINA = 100;

/**
 * Las clientas del negocio, para la manicurista de MB Nails: solo para
 * consultar (nombre, celular, su proxima cita) y agendarles una cita. No se
 * edita ni se borra nada desde aqui. Ver lib/mb-nails.ts.
 */
export default async function ClientasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user, staff } = await requireSession({ manicuristaOk: true });
  if (!esManicuristaDeMbNails(user, staff)) redirect("/panel");

  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const soloNumeros = q.replace(/\D/g, "");
  const clientas = await db.customer.findMany({
    where: {
      userId: user.id,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              ...(soloNumeros.length >= 3 ? [{ phone: { contains: soloNumeros } }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ lastContactAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    take: POR_PAGINA,
    select: { id: true, name: true, phone: true },
  });

  // Su proxima cita, por nombre (las citas guardan el nombre, no la clienta).
  const hoy = todayIn(user.timezone);
  const proximas = clientas.length
    ? await db.appointment.findMany({
        where: {
          userId: user.id,
          day: { gte: hoy },
          status: { in: ["PENDIENTE", "CONFIRMADO"] },
          clientName: { in: clientas.map((c) => c.name), mode: "insensitive" },
        },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
        select: { clientName: true, day: true, startTime: true, staffName: true },
      })
    : [];
  const proxima = new Map<string, (typeof proximas)[number]>();
  for (const a of proximas) if (!proxima.has(a.clientName.toLowerCase())) proxima.set(a.clientName.toLowerCase(), a);

  return (
    <>
      <PageHeader title="Clientas" subtitle="Para consultar y agendarles una cita" />

      <form className="mb-4 flex gap-2" action="/panel/clientas">
        <input className="input min-w-0 flex-1" name="q" defaultValue={q} placeholder="Buscar por nombre o celular" aria-label="Buscar clienta" />
        <button type="submit" className="btn-primary btn-sm shrink-0">
          <Icon name="search" className="h-4 w-4" />
          Buscar
        </button>
      </form>

      {clientas.length === 0 ? (
        <Card>
          <Empty title={q ? "No hay clientas con “" + q + "”" : "Todavía no hay clientas"} hint="Se van guardando solas cuando se les agenda una cita." />
        </Card>
      ) : (
        <ul className="space-y-2" data-lista-clientas>
          {clientas.map((c) => {
            const wa = waLink(c.phone, "Hola " + c.name + ", te escribo de MB Nails Spa.");
            const p = proxima.get(c.name.toLowerCase());
            const agendar = "/panel/mis-citas?agendar=1&nombre=" + encodeURIComponent(c.name) + "&tel=" + encodeURIComponent(c.phone ?? "");
            return (
              <li key={c.id} className="card-tight" data-clienta={c.name}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-strong">{c.name}</p>
                    {c.phone && <p className="text-sm text-muted">{prettyPhone(c.phone)}</p>}
                    {p && (
                      <p className="mt-0.5 text-xs text-brand-700">
                        Próxima cita: {shortDay(p.day)} {pretty12h(p.startTime)}
                        {p.staffName ? " con " + p.staffName : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" aria-label={"WhatsApp a " + c.name}>
                        <Icon name="whatsapp" className="h-4 w-4" />
                      </a>
                    )}
                    <Link href={agendar} className="btn-primary btn-sm" data-agendar-clienta>
                      <Icon name="calendar" className="h-4 w-4" />
                      Agendar
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {clientas.length === POR_PAGINA && <p className="mt-3 text-center text-xs text-muted">Se ven las primeras {POR_PAGINA}. Busca por nombre para encontrar otra.</p>}
    </>
  );
}
