import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { esDueno } from "@/lib/permisos-empleado";
import { db } from "@/lib/db";
import { addDays, startOfMonth, timeIn, todayIn } from "@/lib/dates";
import { money, prettyDay, pretty12h, shortDay } from "@/lib/format";
import { abonado, collectionMessage, debtState, saldo } from "@/lib/debts";
import { cobroDelDia, esPrestamo, estadoPrestamo, ganancia, planDeDeuda, vencimientoDe } from "@/lib/prestamos";
import { esEmInversiones, opcionesPlanDe } from "@/lib/em-inversiones";
import { porQueNoSeCobra, siguienteDiaDeCobro } from "@/lib/festivos";
import { toInternational, waLink } from "@/lib/whatsapp";
import { logoUrl } from "@/lib/nav";
import { esPlanCompleto } from "@/lib/plan";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NewDebtForm } from "@/components/DebtForms";
import { CobrosDeHoy, type Cobro } from "@/components/CobrosDeHoy";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { markCollectedAction } from "@/actions/debts";
import { FormSinSenal } from "@/components/SinSenal";
import { esAdminDeChopo } from "@/lib/chopo";
import { coincideBusqueda } from "@/lib/categorias";
import { VistaPreviaFactura } from "@/components/VistaPreviaFactura";
import type { InvoiceData } from "@/lib/invoice";

export const dynamic = "force-dynamic";

const FILTROS = [
  { key: "pendientes", label: "Por cobrar" },
  { key: "vencidas", label: "Vencidas" },
  { key: "pagadas", label: "Pagadas" },
  { key: "todas", label: "Todas" },
];

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string; v?: string }>;
}) {
  const { user, staff: me } = await requireSession();
  const params = await searchParams;
  const filtro = FILTROS.some((f) => f.key === params.f) ? params.f! : "pendientes";
  // Buscar, filtrar por vendedor, la hora y la vista previa: lo pidio la
  // administradora de Chopo Snacks y es solo suyo (ver lib/chopo.ts).
  const chopo = esAdminDeChopo(user, me);
  const busqueda = chopo ? (params.q ?? "").trim().slice(0, 80) : "";

  const hoy = todayIn(user.timezone);
  const mes = startOfMonth(hoy);

  // EM Inversiones: sin domingos ni festivos, la cuota de hoy no es atraso y
  // tiene el cobro del dia con recibos y planilla (ver lib/em-inversiones.ts).
  const em = esEmInversiones(user.businessName);
  const opciones = opcionesPlanDe(user);
  const diaLibre = em ? porQueNoSeCobra(hoy, user.country) : null;

  // Si hay empleados con cuenta separada, cada uno ve solo las deudas que
  // anoto y los abonos que recibio; el dueño las ve todas.
  const propias = esDueno(me.role);
  const soloMias = propias ? {} : { staffId: me.id };

  const [deudas, cobradoMes, pagosHoy] = await Promise.all([
    db.debt.findMany({
      where: { userId: user.id, ...soloMias },
      orderBy: [{ status: "asc" }, { dueDay: "asc" }, { day: "asc" }],
      include: { payments: { orderBy: { day: "desc" } }, staff: { select: { name: true, color: true } } },
    }),
    db.debtPayment.aggregate({
      // Lo que se paso a un prestamo nuevo al renovar no es plata que entro.
      where: { userId: user.id, day: { gte: mes, lte: hoy }, renewal: false, ...(propias ? {} : { staffId: me.id }) },
      _sum: { amount: true },
    }),
    // Cuantas personas distintas abonaron hoy (no cuantos abonos: uno puede
    // abonar dos veces el mismo dia y sigue siendo una sola persona).
    db.debtPayment.findMany({
      where: { userId: user.id, day: hoy, renewal: false, ...(propias ? {} : { staffId: me.id }) },
      select: { debtId: true },
      distinct: ["debtId"],
    }),
  ]);
  const personasQueAbonaronHoy = pagosHoy.length;

  const conEstado = deudas.map((d) => {
    // El vencimiento segun el plan de este negocio (igual al guardado, salvo
    // en EM Inversiones: ver vencimientoDe).
    const vence = vencimientoDe(d, opciones);
    return { deuda: d, vence, pendiente: saldo(d), estado: debtState({ ...d, dueDay: vence }, hoy) };
  });

  const porCobrar = conEstado.filter((r) => r.deuda.status === "PENDIENTE" && r.pendiente > 0);

  /**
   * El tablero del prestamista.
   *
   * Solo se arma en el negocio de cartera: en una tienda, "a quien le toca
   * pagar hoy" no significa nada porque el fiado no tiene cuotas.
   */
  const esCartera = user.businessType === "CARTERA";
  const cobrosHoy: Cobro[] = [];
  const cobrosAtrasados: Cobro[] = [];
  /** Lo atrasado de verdad, sin la cuota de hoy en EM Inversiones. */
  let atrasoTotal = 0;

  if (esCartera) {
    for (const { deuda, vence, pendiente, estado } of porCobrar) {
      const plan = planDeDeuda(deuda, opciones);
      const est = plan.length > 0 ? estadoPrestamo(plan, abonado(deuda), hoy) : null;

      const enlaceWhatsapp = deuda.clientPhone
        ? waLink(
            toInternational(deuda.clientPhone, user.whatsappNumber, user.timezone),
            collectionMessage({
              businessName: user.businessName,
              clientName: deuda.clientName,
              concept: deuda.concept,
              saldo: pendiente,
              currency: user.currency,
              estado,
              prettyDue: vence ? prettyDay(vence) : null,
            })
          )
        : null;

      const base = { id: deuda.id, clientName: deuda.clientName, enlaceWhatsapp };

      if (em) {
        // La cuota que cae hoy no es atraso: el dia no se ha acabado. Se le
        // cobra junto con lo atrasado, si hay.
        if (plan.length === 0) continue;
        const c = cobroDelDia(plan, abonado(deuda), hoy);
        if (c.aCobrar <= 0 || c.cuotaN === null) continue;
        const detalle = "Cuota " + c.cuotaN + " de " + plan.length;
        atrasoTotal += c.atraso;
        (c.atraso > 0 ? cobrosAtrasados : cobrosHoy).push({
          ...base,
          detalle,
          monto: Math.min(c.aCobrar, pendiente),
          cuotasAtrasadas: c.cuotasAtrasadas,
        });
        continue;
      }

      if (est && est.atraso > 0) {
        atrasoTotal += est.atraso;
        cobrosAtrasados.push({
          ...base,
          detalle: esPrestamo(deuda)
            ? "Cuota " + Math.min(est.cuotasPagadas + 1, plan.length) + " de " + plan.length
            : null,
          monto: est.atraso,
          cuotasAtrasadas: est.cuotasAtrasadas,
        });
      } else if (est && est.tocaHoy) {
        cobrosHoy.push({
          ...base,
          detalle: "Cuota " + Math.min(est.cuotasPagadas + 1, plan.length) + " de " + plan.length,
          monto: est.montoDeHoy,
          cuotasAtrasadas: 0,
        });
      }
    }

    cobrosAtrasados.sort((a, b) => b.monto - a.monto);
  }

  const vencidas = porCobrar.filter((r) => r.estado.key === "vencida");
  const totalPorCobrar = porCobrar.reduce((s, r) => s + r.pendiente, 0);
  const totalVencido = vencidas.reduce((s, r) => s + r.pendiente, 0);
  /**
   * Que significa "vencido" en cada oficio.
   *
   * En una tienda es la deuda cuya fecha ya paso. En un prestamo por cuotas
   * eso no sirve: la fecha final puede estar a veinte dias y el cliente llevar
   * tres cuotas sin pagar. Ahi lo vencido es el atraso contra el plan, o la
   * pantalla diria "Vencido $0" al lado de "Atrasados $90.000".
   */
  const vencidoLabel = esCartera ? "Atrasado" : "Vencido";
  const vencidoValor = esCartera ? atrasoTotal : totalVencido;
  const vencidoCuantos = esCartera ? cobrosAtrasados.length : vencidas.length;

  /** Lo que tiene prestado en la calle, sin contar el interes. */
  const enLaCalle = esCartera
    ? porCobrar.reduce((s, r) => s + (r.deuda.principal ?? 0), 0)
    : 0;

  /**
   * Cuanto interes falta por cobrar en los prestamos que siguen activos.
   * Lo abonado baja primero de forma proporcional entre capital e interes,
   * igual que cualquier abono parcial: lo que falta de interes es
   * proporcional a lo que falta del total.
   */
  const interesPorCobrar = esCartera
    ? porCobrar.reduce((s, r) => {
        const { deuda, pendiente } = r;
        if (!deuda.principal || !deuda.interestPct || deuda.amount <= 0) return s;
        const interesTotal = ganancia(deuda.principal, deuda.interestPct);
        return s + Math.round((interesTotal * pendiente) / deuda.amount);
      }, 0)
    : 0;

  const delFiltro =
    filtro === "pendientes"
      ? porCobrar
      : filtro === "vencidas"
        ? vencidas
        : filtro === "pagadas"
          ? conEstado.filter((r) => r.estado.key === "pagada")
          : conEstado;

  // Quienes anotaron deudas, para filtrar por vendedor. Salen de las mismas
  // deudas, asi que aparece tambien quien ya no trabaja ahi. El empleado solo
  // ve las suyas: para el no hay nada que filtrar.
  const vendedores = chopo && propias
    ? [...new Map(deudas.flatMap((d) => (d.staffId && d.staff ? [[d.staffId, d.staff.name] as const] : []))).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
    : [];
  const vendedor = vendedores.some((x) => x.id === params.v) ? params.v! : "";

  const visibles = delFiltro.filter(
    ({ deuda }) =>
      (!vendedor || deuda.staffId === vendedor) &&
      coincideBusqueda([deuda.clientName, deuda.clientPhone, deuda.concept, deuda.notes], busqueda)
  );
  const buscando = Boolean(busqueda || vendedor);
  /** El enlace de un filtro, sin perder lo que se busco ni el vendedor. */
  const enlaceFiltro = (f: string) => {
    const p = new URLSearchParams({ f });
    if (busqueda) p.set("q", busqueda);
    if (vendedor) p.set("v", vendedor);
    return "/panel/cartera?" + p.toString();
  };

  const logo = logoUrl(user.slug, user.hasLogo, user.updatedAt);
  const completo = esPlanCompleto(user);
  /** El mismo recibo del fiado que sale en Ventas, para la vista previa. */
  const datosFiado = (d: (typeof deudas)[number]): InvoiceData => ({
    saleId: d.id,
    receiptSeq: d.receiptSeq,
    businessName: user.businessName,
    businessPhone: user.phone,
    businessAddress: user.address,
    logoUrl: logo,
    currency: user.currency,
    day: d.day,
    hora: pretty12h(timeIn(d.createdAt, user.timezone)),
    clientName: d.clientName,
    clientPhone: d.clientPhone,
    businessEmail: user.email,
    timezone: user.timezone,
    paymentMethod: "CREDITO",
    staffName: d.staff?.name ?? null,
    items: [{ name: d.concept, qty: 1, unitPrice: d.amount }],
    total: d.amount,
    notes: d.notes,
    marcaGratis: !completo,
  });

  return (
    <>
      <PageHeader
        title={esCartera ? "Cuentas por cobrar" : "Cartera"}
        subtitle={
          (esCartera
            ? "A quién le toca pagar hoy, quién se atrasó y cuánto tienes en la calle"
            : "Quién te debe, cuánto y desde cuándo") + (propias ? "" : " · Solo ves las tuyas")
        }
      />

      {esCartera && (
        <div className="mb-4 space-y-3">
          {em && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3">
              <Icon name="print" className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 text-sm text-body">
                {diaLibre ? (
                  <>
                    <strong>Hoy no se cobra</strong> ({diaLibre}). No corre el atraso. Próximo día de cobro:{" "}
                    {prettyDay(siguienteDiaDeCobro(addDays(hoy, 1), user.country))}.
                  </>
                ) : (
                  "Los recibos de todos los que pagan hoy y la planilla para el cobrador."
                )}
              </span>
              <Link
                href={
                  "/panel/cartera/cobro" +
                  (diaLibre ? "?dia=" + siguienteDiaDeCobro(addDays(hoy, 1), user.country) : "")
                }
                className="btn-primary btn-sm"
              >
                {diaLibre ? "Preparar el próximo cobro" : "Cobro del día"}
              </Link>
            </div>
          )}
          <CobrosDeHoy
            atrasados={cobrosAtrasados}
            deHoy={cobrosHoy}
            currency={user.currency}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Por cobrar"
          value={money(totalPorCobrar, user.currency)}
          hint={porCobrar.length + (porCobrar.length === 1 ? " deuda" : " deudas")}
          tone={totalPorCobrar > 0 ? "amber" : "good"}
        />
        <Stat
          label={vencidoLabel}
          value={money(vencidoValor, user.currency)}
          hint={
            esCartera
              ? vencidoCuantos + (vencidoCuantos === 1 ? " persona" : " personas")
              : vencidoCuantos + (vencidoCuantos === 1 ? " deuda" : " deudas")
          }
          tone={vencidoValor > 0 ? "bad" : "good"}
        />
        <Stat
          label="Cobrado este mes"
          value={money(cobradoMes._sum.amount ?? 0, user.currency)}
          hint={"Desde el " + shortDay(mes)}
          tone="good"
        />
        {esCartera ? (
          <Stat
            label="En la calle"
            value={money(enLaCalle, user.currency)}
            hint="Capital prestado, sin el interes"
          />
        ) : (
          <Stat
            label="Deuda promedio"
            value={money(
              porCobrar.length ? Math.round(totalPorCobrar / porCobrar.length) : 0,
              user.currency
            )}
            hint="Por cliente que debe"
          />
        )}
      </div>

      {esCartera && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat
            label="Por recoger hoy"
            value={money(atrasoTotal + cobrosHoy.reduce((s, c) => s + c.monto, 0), user.currency)}
            hint={cobrosAtrasados.length + cobrosHoy.length + (cobrosAtrasados.length + cobrosHoy.length === 1 ? " persona" : " personas")}
            tone="brand"
          />
          <Stat
            label="Abonaron hoy"
            value={String(personasQueAbonaronHoy)}
            hint={personasQueAbonaronHoy === 1 ? "persona" : "personas"}
            tone="good"
          />
          <Stat
            label="Interés por cobrar"
            value={money(interesPorCobrar, user.currency)}
            hint="Lo que falta de ganancia en lo activo"
          />
        </div>
      )}

      {!esCartera && vencidas.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bad-soft px-4 py-3 text-sm text-bad">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span>
            Tienes {vencidas.length} {vencidas.length === 1 ? "deuda vencida" : "deudas vencidas"}{" "}
            por {money(totalVencido, user.currency)}.
          </span>
          <Link href="/panel/cartera?f=vencidas" className="link ml-auto">
            Ver cuales
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Link
                key={f.key}
                href={enlaceFiltro(f.key)}
                className={filtro === f.key ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
              >
                {f.label}
              </Link>
            ))}
          </div>

          {chopo && (
            <form action="/panel/cartera" className="card-tight space-y-2" data-buscar-cartera>
              <input type="hidden" name="f" value={filtro} />
              <div className="flex gap-2">
                <input
                  className="input min-w-0 flex-1 py-1.5 text-sm"
                  type="search"
                  name="q"
                  defaultValue={busqueda}
                  placeholder="Buscar cliente, teléfono o producto"
                  aria-label="Buscar en cuentas por cobrar"
                />
                <button type="submit" className="btn-primary btn-sm shrink-0">
                  <Icon name="search" className="h-4 w-4" />
                  Buscar
                </button>
              </div>
              {vendedores.length > 1 && (
                <select
                  className="input py-1.5 text-sm"
                  name="v"
                  defaultValue={vendedor}
                  aria-label="Filtrar por vendedor"
                >
                  <option value="">Todos los vendedores</option>
                  {vendedores.map((x) => (
                    <option key={x.id} value={x.id}>
                      Anotó {x.name}
                    </option>
                  ))}
                </select>
              )}
              {buscando && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>
                    {visibles.length} {visibles.length === 1 ? "deuda" : "deudas"} ·{" "}
                    {money(
                      visibles.reduce((s, r) => s + r.pendiente, 0),
                      user.currency
                    )}{" "}
                    por cobrar
                  </span>
                  <Link href={"/panel/cartera?f=" + filtro} className="link">
                    Quitar búsqueda
                  </Link>
                </p>
              )}
            </form>
          )}

          {visibles.length === 0 ? (
            <Card>
              <Empty
                title={
                  deudas.length === 0
                    ? "Nadie te debe nada"
                    : buscando
                      ? "No hay deudas con esa búsqueda"
                      : "No hay deudas en este filtro"
                }
                hint={
                  deudas.length === 0
                    ? "Cuando fies o quede un saldo pendiente, anotalo a la derecha."
                    : buscando
                      ? "Prueba con otro nombre, otro vendedor u otro filtro."
                      : "Prueba con otro filtro."
                }
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {visibles.map(({ deuda, vence, pendiente, estado }) => {
                const enlace = deuda.clientPhone
                  ? waLink(
                      toInternational(deuda.clientPhone, user.whatsappNumber, user.timezone),
                      collectionMessage({
                        businessName: user.businessName,
                        clientName: deuda.clientName,
                        concept: deuda.concept,
                        saldo: pendiente,
                        currency: user.currency,
                        estado,
                        prettyDue: vence ? prettyDay(vence) : null,
                      })
                    )
                  : null;

                return (
                  <li key={deuda.id} className="card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-display text-[16px] text-strong">
                          {deuda.clientName}
                          <Badge
                            tone={
                              estado.tone === "good"
                                ? "green"
                                : estado.tone === "bad"
                                  ? "red"
                                  : estado.tone === "amber"
                                    ? "amber"
                                    : "slate"
                            }
                          >
                            {estado.label}
                          </Badge>
                        </p>
                        <p className="mt-1 text-sm text-body">{deuda.concept}</p>
                        <p className="mt-1 text-xs text-subtle">
                          Debe desde el {shortDay(deuda.day)}
                          {chopo ? " · " + pretty12h(timeIn(deuda.createdAt, user.timezone)) : ""}
                          {vence ? " - vence el " + shortDay(vence) : ""}
                          {deuda.payments.length > 0
                            ? " - " + deuda.payments.length + " abonos"
                            : ""}
                        </p>
                        {/* A quien le toca: solo tiene sentido mostrarlo cuando hay
                            mas de una persona anotando deudas, es decir, al dueño. */}
                        {propias && deuda.staff && (
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: deuda.staff.color }} />
                            Anotó {deuda.staff.name}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="stat-value text-strong">
                          {money(pendiente, user.currency)}
                        </p>
                        {pendiente !== deuda.amount && (
                          <p className="mt-1 text-[11px] text-subtle">
                            de {money(deuda.amount, user.currency)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      <Link href={"/panel/cartera/" + deuda.id} className="btn-primary btn-sm">
                        Abrir
                      </Link>

                      {chopo && <VistaPreviaFactura data={datosFiado(deuda)} soloBluetooth={!propias} />}

                      {pendiente > 0 && enlace && (
                        <>
                          <a
                            href={enlace}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-success btn-sm"
                          >
                            <Icon name="whatsapp" className="h-4 w-4" />
                            Cobrar
                          </a>
                          <FormSinSenal accion="markCollectedAction" servidor={markCollectedAction}>
                            <input type="hidden" name="id" value={deuda.id} />
                            <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                              Ya le cobre
                            </SubmitButton>
                          </FormSinSenal>
                        </>
                      )}

                      {pendiente > 0 && !deuda.clientPhone && (
                        <span className="self-center text-xs text-subtle">
                          Sin WhatsApp no se le puede cobrar por chat
                        </span>
                      )}

                      {deuda.lastReminderAt && (
                        <span className="self-center text-[11px] text-subtle">
                          Ultimo cobro: {shortDay(deuda.lastReminderAt.toISOString().slice(0, 10))}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <Card title={esCartera ? "Anotar un préstamo" : "Anotar una deuda"} subtitle="Lo que quedo debiendo un cliente">
            <NewDebtForm
              today={hoy}
              currency={user.currency}
              prestamos={esCartera}
              opciones={opciones}
              negocio={{
                businessName: user.businessName,
                businessPhone: user.phone,
                businessAddress: user.address,
                logoUrl: logo,
                marcaGratis: !completo,
              }}
            />
          </Card>

          <Card title="Como funciona la plata">
            <ul className="space-y-2.5 text-sm text-body">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Si <strong>no</strong> registraste la venta cuando fiaste, cada abono entra como
                venta del dia en que lo recibes.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Si <strong>si</strong> la registraste, los abonos solo bajan el saldo. Asi no
                cuentas la misma plata dos veces.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Cada abono genera un comprobante que le puedes mandar al cliente.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
