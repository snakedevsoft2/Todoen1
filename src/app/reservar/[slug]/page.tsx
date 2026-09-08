import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { addDays, isValidDay, timeIn, todayIn } from "@/lib/dates";
import { buildSlots, isWorkDay, workDaysArray } from "@/lib/slots";
import { pretty12h, prettyDay } from "@/lib/format";
import { WEEKDAYS } from "@/lib/timezones";
import { logoUrl } from "@/lib/nav";
import { BookingForm } from "@/components/BookingForm";
import { DayPicker } from "@/components/DayPicker";
import { Alert } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ThemeStyle } from "@/components/ThemeStyle";
import { BrandMark } from "@/components/BrandMark";

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
  searchParams: Promise<{ d?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const shop = await db.user.findUnique({ where: { slug } });
  if (!shop) notFound();

  const today = todayIn(shop.timezone);
  const requested = query.d && isValidDay(query.d) ? query.d : today;
  const day = requested < today ? today : requested;

  const [services, appointments] = await Promise.all([
    db.service.findMany({
      where: { userId: shop.id, active: true, bookable: true },
      orderBy: [{ category: "asc" }, { price: "asc" }],
      select: { id: true, name: true, price: true, durationMin: true, description: true },
    }),
    db.appointment.findMany({
      where: { userId: shop.id, day, status: { not: "CANCELADO" } },
      select: { startTime: true },
    }),
  ]);

  const slots = buildSlots(shop);
  const taken = appointments.map((a) => a.startTime);
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
  if (!shop.bookingOpen) disabledReason = "Las reservas estan cerradas por ahora. Escribenos directamente.";
  else if (services.length === 0) disabledReason = "El negocio todavia no publico sus servicios.";
  else if (!dayOpen) disabledReason = "Este dia no atendemos. Elige otro dia del horario.";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <ThemeStyle brandColor={shop.brandColor} theme={shop.theme} />

      <header className="text-center">
        <div className="mx-auto mb-3 flex justify-center">
          <BrandMark
            name={shop.businessName}
            logo={logoUrl(shop.slug, shop.logo, shop.updatedAt)}
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

      <div className="card mt-6">
        <h2 className="text-base font-semibold text-strong">1. Elige el dia</h2>
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
                href={"/reservar/" + slug + "?d=" + d}
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
          <DayPicker basePath={"/reservar/" + slug} day={day} min={today} />
        </div>
        <p className="mt-2 text-xs text-subtle">{prettyDay(day)}</p>
      </div>

      <div className="card mt-4">
        <h2 className="text-base font-semibold text-strong">2. Separa tu cupo</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Elige la hora libre y el servicio. El cupo queda guardado a tu nombre.
        </p>

        {shop.businessType !== "BARBERIA" && !disabledReason && (
          <div className="mb-4">
            <Alert kind="info">Este negocio tambien recibe reservas por hora.</Alert>
          </div>
        )}

        <BookingForm
          slug={slug}
          day={day}
          slots={slots}
          taken={taken}
          services={services}
          currency={shop.currency}
          minTime={day === today ? timeIn(new Date(), shop.timezone) : null}
          disabled={Boolean(disabledReason)}
          disabledReason={disabledReason}
        />
      </div>

      <p className="mt-6 text-center text-xs text-subtle">
        Si necesitas cambiar o cancelar tu turno, llama al negocio.
      </p>
    </div>
  );
}
