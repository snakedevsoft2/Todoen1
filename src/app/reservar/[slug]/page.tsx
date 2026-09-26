import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { addDays, isValidDay, timeIn, todayIn } from "@/lib/dates";
import { buildSlots, isWorkDay, workDaysArray } from "@/lib/slots";
import { money, pretty12h, prettyDay } from "@/lib/format";
import { WEEKDAYS } from "@/lib/timezones";
import { logoUrl, photoUrl } from "@/lib/nav";
import { BookingForm } from "@/components/BookingForm";
import { DayPicker } from "@/components/DayPicker";
import { Icon } from "@/components/Icon";
import { ThemeStyle } from "@/components/ThemeStyle";
import { BrandMark } from "@/components/BrandMark";
import { ChatAgente } from "@/components/ChatAgente";
import { aiEnabled } from "@/lib/ai";
import { configDe, saludoDe } from "@/lib/agente";
import { negocioTieneLogo, serviciosConFoto } from "@/lib/imagenes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await db.user.findUnique({ where: { slug }, select: { businessName: true } });
  return {
    title: shop ? "Separar turno - " + shop.businessName : "Separar turno",
  };
}

export default async function ReservarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ d?: string; s?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const shop = await db.user.findUnique({ where: { slug }, omit: { logo: true, publicCover: true } });
  if (!shop) notFound();

  // La agenda por hora es de la barberia y el lavadero. La tienda de ropa
  // tiene su catalogo en esta misma direccion publica, asi que la mandamos alla.
  if (shop.businessType !== "BARBERIA" && shop.businessType !== "LAVADERO") {
    if (shop.businessType === "ROPA") redirect("/catalogo/" + slug);
    notFound();
  }

  const today = todayIn(shop.timezone);
  const requested = query.d && isValidDay(query.d) ? query.d : today;
  const day = requested < today ? today : requested;

  const [servicesRaw, appointments, team, tieneLogo, conFoto] = await Promise.all([
    db.service.findMany({
      where: { userId: shop.id, active: true, bookable: true },
      orderBy: [{ category: "asc" }, { price: "asc" }],
      select: { id: true, name: true, price: true, durationMin: true, description: true, updatedAt: true },
    }),
    db.appointment.findMany({
      where: { userId: shop.id, day, status: { not: "CANCELADO" } },
      select: { startTime: true, staffId: true },
    }),
    db.staff.findMany({
      where: { userId: shop.id, active: true, bookable: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    negocioTieneLogo(shop.id),
    serviciosConFoto({ userId: shop.id, active: true, bookable: true }),
  ]);

  // Primero el corte, con su foto, y despues la fecha y la hora: asi se ve el
  // corte que se va a hacer antes de comprometerse a un dia. Si llega con
  // "?s=" (por ejemplo desde una foto del portafolio), ya arranca en el paso 2.
  const services = servicesRaw.map((s) => ({
    ...s,
    photo: photoUrl(s.id, conFoto.has(s.id), s.updatedAt),
  }));
  const service = query.s ? services.find((s) => s.id === query.s) ?? null : null;

  const agente = aiEnabled() ? await configDe(shop.id) : null;
  const slots = buildSlots(shop);
  const taken = appointments.map((a) => ({ staffId: a.staffId, startTime: a.startTime }));

  // Con varios barberos hay mas cupos: cada uno atiende su propia agenda.
  const cuposDelDia = slots.length * Math.max(1, team.length);
  const dayOpen = isWorkDay(day, shop.workDays);
  const workDayNames = workDaysArray(shop.workDays)
    .map((d) => WEEKDAYS.find((w) => w.value === d)?.label ?? "")
    .filter(Boolean);

  const horario =
    workDayNames.length > 0
      ? workDayNames[0] +
        " a " +
        workDayNames[workDayNames.length - 1] +
        " de " +
        pretty12h(String(shop.openHour).padStart(2, "0") + ":00") +
        " a " +
        pretty12h(String(shop.closeHour).padStart(2, "0") + ":00")
      : "Consulta el horario con el negocio";

  const quickDays = [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(today, offset));

  let disabledReason: string | undefined;
  if (!shop.bookingOpen) disabledReason = "Las reservas están cerradas por ahora. Escríbenos directamente.";
  else if (services.length === 0) disabledReason = "El negocio todavía no publicó sus servicios.";
  else if (!dayOpen) disabledReason = "Este día no atendemos. Elige otro día del horario.";
  else if (appointments.length >= cuposDelDia) {
    disabledReason = "Este día ya se llenó. Elige otro día.";
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <ThemeStyle brandColor={shop.brandColor} theme={shop.theme} />

      <header className="text-center">
        <div className="mx-auto mb-3 flex justify-center">
          <BrandMark
            name={shop.businessName}
            logo={logoUrl(shop.slug, tieneLogo, shop.updatedAt)}
            size="xl"
          />
        </div>
        <h1 className="text-2xl font-bold text-strong sm:text-3xl">{shop.businessName}</h1>
        {shop.tagline && (
          <p className="mx-auto mt-1 max-w-md text-sm text-brand-600">{shop.tagline}</p>
        )}
        <p className="mt-2 text-sm text-muted">{horario}</p>
        {shop.address && <p className="mt-1 text-xs text-subtle">{shop.address}</p>}
        {shop.phone && (
          <p className="mt-1 text-xs text-subtle">
            <Icon name="phone" className="mr-1 inline h-3 w-3" />
            {shop.phone}
          </p>
        )}
      </header>

      {!service ? (
        <div className="card mt-6">
          <h2 className="text-base font-semibold text-strong">1. Elige el corte</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Toca el que quieres hacerte.</p>
          {services.length === 0 ? (
            <p className="text-sm text-muted">El negocio todavía no publicó sus servicios.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {services.map((s) => (
                <Link
                  key={s.id}
                  href={"/reservar/" + slug + "?d=" + day + "&s=" + s.id}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-panel">
                    {s.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.photo}
                        alt={s.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <Icon name="scissors" className="h-6 w-6 text-subtle" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-sm font-bold text-strong">{s.name}</p>
                    <p className="text-xs text-muted">
                      {money(s.price, shop.currency)} · {s.durationMin} min
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card mt-6 flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-panel">
              {service.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={service.photo} alt={service.name} className="h-full w-full object-cover" />
              ) : (
                <Icon name="scissors" className="h-5 w-5 text-subtle" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-strong">{service.name}</p>
              <p className="text-xs text-muted">
                {money(service.price, shop.currency)} · {service.durationMin} min
              </p>
            </div>
            <Link href={"/reservar/" + slug + "?d=" + day} className="btn-ghost btn-sm shrink-0">
              Cambiar
            </Link>
          </div>

          <div className="card mt-4">
            <h2 className="text-base font-semibold text-strong">2. Elige el día</h2>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {quickDays.map((d) => {
                const [, m, dd] = d.split("-");
                const label = WEEKDAYS.find(
                  (w) => w.value === (new Date(d + "T12:00:00Z").getUTCDay() || 7)
                )?.short;
                const selected = d === day;
                const open = isWorkDay(d, shop.workDays);
                return (
                  <a
                    key={d}
                    href={"/reservar/" + slug + "?d=" + d + "&s=" + service.id}
                    className={
                      "shrink-0 rounded-xl border px-3 py-2 text-center transition " +
                      (selected
                        ? "border-brand-600 bg-brand-600 text-on-brand"
                        : open
                          ? "border-line bg-surface text-body hover:bg-surface"
                          : "border-line bg-surface text-subtle")
                    }
                  >
                    <span className="block text-[10px] uppercase tracking-wide">{label}</span>
                    <span className="block text-sm font-bold">
                      {dd}/{m}
                    </span>
                  </a>
                );
              })}
            </div>
            <div className="mt-3">
              <DayPicker
                basePath={"/reservar/" + slug}
                day={day}
                min={today}
                extraQuery={"s=" + service.id}
              />
            </div>
            <p className="mt-2 text-xs text-subtle">{prettyDay(day)}</p>
          </div>

          <div className="card mt-4">
            <h2 className="text-base font-semibold text-strong">3. Separa tu cupo</h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              {team.length > 1
                ? "Elige con quién te quieres atender y la hora libre. El cupo queda guardado a tu nombre."
                : "Elige la hora libre. El cupo queda guardado a tu nombre."}
            </p>

            <BookingForm
              slug={slug}
              day={day}
              slots={slots}
              taken={taken}
              team={team}
              service={service}
              minTime={day === today ? timeIn(new Date(), shop.timezone) : null}
              disabled={Boolean(disabledReason)}
              disabledReason={disabledReason}
            />
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs text-subtle">
        Si necesitas cambiar o cancelar tu turno, llama al negocio.
      </p>
      {agente?.webOn && (
        <ChatAgente
          endpoint={"/api/agente/" + shop.slug}
          negocio={shop.businessName}
          saludo={saludoDe(shop, agente)}
          almacen={shop.slug}
        />
      )}
    </div>
  );
}
