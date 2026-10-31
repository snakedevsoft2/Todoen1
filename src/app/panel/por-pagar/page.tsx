import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfMonth, todayIn } from "@/lib/dates";
import { shortDay } from "@/lib/format";
import { normalizar } from "@/lib/orden-productos";
import {
  RUTA_POR_PAGAR,
  cifra,
  dinero,
  estadoDe,
  gananciaDe,
  puedeVerPorPagar,
  redondear,
  subtotalDe,
  totalDe,
  totalVentaDe,
  ventaDe,
} from "@/lib/por-pagar";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { BotonBorrar } from "@/components/BotonBorrar";
import { CompraBoton, PagosCompra, ProveedorForm, type Sugerencia } from "@/components/PorPagarForms";
import { borrarCompraAction, borrarProveedorAction } from "@/actions/por-pagar";

export const dynamic = "force-dynamic";

/**
 * Cuentas por pagar a proveedores (ver lib/por-pagar.ts).
 *
 * Es el Excel de Chopo Snacks pasado a la aplicacion: a la izquierda un boton
 * por proveedor (el elegido en naranja), y a la derecha su hoja, con cada
 * compra agrupada por fecha, su total y si ya se pago. Arriba, la lista de a
 * quien se le debe.
 */
export default async function PorPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; v?: string }>;
}) {
  const { user, staff } = await requireSession();
  // A quien no le toca, ni siquiera se le dice que existe.
  if (!puedeVerPorPagar(user, staff)) notFound();

  const params = await searchParams;
  const cur = user.currency;
  const hoy = todayIn(user.timezone);
  const mes = startOfMonth(hoy);

  const proveedores = await db.payableSupplier.findMany({
    where: { userId: user.id },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      bills: {
        orderBy: [{ day: "asc" }, { createdAt: "asc" }],
        include: {
          items: { orderBy: { position: "asc" } },
          payments: { orderBy: [{ day: "asc" }, { createdAt: "asc" }] },
        },
      },
    },
  });

  // Los Decimal de la base pasan a numeros aqui, una sola vez.
  const cuentas = proveedores.map((p) => {
    const compras = p.bills.map((b) => {
      const renglones = b.items.map((i) => ({
        id: i.id,
        description: i.description,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount),
        salePrice: i.salePrice === null ? null : Number(i.salePrice),
      }));
      const pagos = b.payments.map((x) => ({ id: x.id, amount: Number(x.amount), day: x.day, notes: x.notes }));
      const iva = Number(b.taxPct);
      const total = totalDe(renglones, iva);
      const pagado = redondear(pagos.reduce((s, x) => s + x.amount, 0));
      return {
        id: b.id,
        day: b.day,
        document: b.document,
        notes: b.notes,
        iva,
        renglones,
        pagos,
        total,
        pagado,
        falta: redondear(total - pagado),
        estado: estadoDe(total, pagado),
        totalVenta: totalVentaDe(renglones),
        ganancia: gananciaDe(renglones, iva),
      };
    });
    const pendientes = compras.filter((c) => c.estado === "PENDIENTE");
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      notes: p.notes,
      compras,
      comprado: redondear(compras.reduce((s, c) => s + c.total, 0)),
      pagado: redondear(compras.reduce((s, c) => s + c.pagado, 0)),
      saldo: redondear(pendientes.reduce((s, c) => s + c.falta, 0)),
      pendientes: pendientes.length,
      ultima: compras.at(-1)?.day ?? null,
    };
  });

  const conSaldo = cuentas.filter((p) => p.saldo > 0.004).sort((a, b) => b.saldo - a.saldo);
  const totalPorPagar = redondear(conSaldo.reduce((s, p) => s + p.saldo, 0));
  const todasLasCompras = cuentas.flatMap((p) => p.compras);
  const compradoMes = redondear(
    todasLasCompras.filter((c) => c.day >= mes && c.day <= hoy).reduce((s, c) => s + c.total, 0)
  );
  const pagadoMes = redondear(
    todasLasCompras
      .flatMap((c) => c.pagos)
      .filter((x) => x.day >= mes && x.day <= hoy)
      .reduce((s, x) => s + x.amount, 0)
  );

  const elegido = cuentas.find((p) => p.id === params.p) ?? null;
  const vista = params.v === "todos" ? "todos" : "pendientes";

  return (
    <>
      <PageHeader title="Cuentas por pagar" subtitle="Lo que le debes a cada proveedor · Solo lo ves tú" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Por pagar"
          value={dinero(totalPorPagar, cur)}
          hint={conSaldo.length + (conSaldo.length === 1 ? " proveedor" : " proveedores")}
          tone={totalPorPagar > 0 ? "amber" : "good"}
        />
        <Stat label="Comprado este mes" value={dinero(compradoMes, cur)} hint={"Desde el " + shortDay(mes)} />
        <Stat label="Pagado este mes" value={dinero(pagadoMes, cur)} tone="good" />
        <Stat label="Proveedores" value={String(cuentas.length)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[240px_1fr] [&>*]:min-w-0">
        <aside className="space-y-3">
          {cuentas.length > 0 && (
            <nav
              aria-label="Proveedores"
              data-botones-proveedores
              className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {cuentas.map((p) => {
                const actual = p.id === elegido?.id;
                return (
                  <Link
                    key={p.id}
                    href={RUTA_POR_PAGAR + "?p=" + p.id}
                    aria-current={actual ? "page" : undefined}
                    className={
                      // Los colores de los botones del Excel: azul, y naranja el abierto.
                      "shrink-0 rounded-lg border-2 px-3 py-2 text-[12px] font-bold uppercase leading-tight shadow-sm transition " +
                      (actual
                        ? "border-[#c55a11] bg-[#f4b183] text-[#3b1d06] lg:text-right"
                        : "border-[#2f5597] bg-[#b4c7e7] text-[#1b2a4a] hover:bg-[#a3b9df]")
                    }
                  >
                    <span className="block whitespace-nowrap lg:whitespace-normal">{p.name}</span>
                    {p.saldo > 0.004 && (
                      <span className="block text-[11px] font-semibold normal-case text-[#9c1c1c]">
                        Debes {dinero(p.saldo, cur)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          <details className="card-tight" open={cuentas.length === 0} data-nuevo-proveedor>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-600">
              <Icon name="plus" className="h-4 w-4" />
              Nuevo proveedor
            </summary>
            <div className="mt-3">
              <ProveedorForm />
            </div>
          </details>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link
              href={RUTA_POR_PAGAR + "?v=pendientes"}
              className={!elegido && vista === "pendientes" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
            >
              Por pagar
            </Link>
            <Link
              href={RUTA_POR_PAGAR + "?v=todos"}
              className={!elegido && vista === "todos" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
            >
              Todos los proveedores
            </Link>
          </div>

          {elegido ? (
            <HojaProveedor p={elegido} cur={cur} hoy={hoy} />
          ) : cuentas.length === 0 ? (
            <Card>
              <Empty
                title="Todavía no hay proveedores"
                hint="Agrega el primero y anota lo que le compras. Aquí vas a ver a quién le debes y cuánto."
              />
            </Card>
          ) : vista === "todos" ? (
            <Card title="Todos los proveedores" subtitle="Lo que se les ha comprado y pagado">
              <ul className="divide-y divide-line" data-lista-proveedores>
                {cuentas.map((p) => (
                  <li key={p.id}>
                    <Link href={RUTA_POR_PAGAR + "?p=" + p.id} className="flex items-center gap-3 py-2.5 hover:bg-surface">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-strong">{p.name}</span>
                        <span className="block text-xs text-subtle">
                          Comprado {dinero(p.comprado, cur)} · Pagado {dinero(p.pagado, cur)}
                        </span>
                      </span>
                      <span className={"shrink-0 text-sm font-bold " + (p.saldo > 0.004 ? "text-bad" : "text-good")}>
                        {p.saldo > 0.004 ? dinero(p.saldo, cur) : "Al día"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card title="Proveedores por pagar" subtitle="A quién le debes y cuánto, de mayor a menor">
              {conSaldo.length === 0 ? (
                <Empty title="No le debes nada a ningún proveedor" hint="Las compras pendientes aparecen aquí." />
              ) : (
                <ul className="divide-y divide-line" data-lista-por-pagar>
                  {conSaldo.map((p) => (
                    <li key={p.id}>
                      <Link href={RUTA_POR_PAGAR + "?p=" + p.id} className="flex items-center gap-3 py-2.5 hover:bg-surface">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-strong">{p.name}</span>
                          <span className="block text-xs text-subtle">
                            {p.pendientes} {p.pendientes === 1 ? "compra pendiente" : "compras pendientes"}
                            {p.ultima ? " · última compra " + shortDay(p.ultima) : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold text-bad">{dinero(p.saldo, cur)}</span>
                      </Link>
                    </li>
                  ))}
                  <li className="flex items-center justify-between py-2.5 text-sm font-bold text-strong">
                    <span>Total por pagar</span>
                    <span className="rounded bg-[#ffff00] px-2 text-black">{dinero(totalPorPagar, cur)}</span>
                  </li>
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

type Cuenta = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  comprado: number;
  pagado: number;
  saldo: number;
  compras: {
    id: string;
    day: string;
    document: string | null;
    notes: string | null;
    iva: number;
    renglones: { id: string; description: string; qty: number; unitPrice: number; discount: number; salePrice: number | null }[];
    pagos: { id: string; amount: number; day: string; notes: string | null }[];
    total: number;
    pagado: number;
    falta: number;
    estado: "PENDIENTE" | "CANCELADO";
    totalVenta: number | null;
    ganancia: number | null;
  }[];
};

/** La hoja de un proveedor, con las mismas columnas que en el Excel. */
function HojaProveedor({ p, cur, hoy }: { p: Cuenta; cur: string; hoy: string }) {
  const renglones = p.compras.flatMap((c) => c.renglones);
  // Las columnas de descuento y de venta solo salen si el proveedor las usa.
  const conDescuento = renglones.some((r) => r.discount > 0);
  const conVenta = renglones.some((r) => r.salePrice !== null);
  const totalVenta = redondear(p.compras.reduce((s, c) => s + (c.totalVenta ?? 0), 0));
  const ganancia = redondear(p.compras.reduce((s, c) => s + (c.ganancia ?? 0), 0));

  // Para escribir rapido: lo que ya se le compro, con el precio de la ultima vez.
  const sugerencias = new Map<string, Sugerencia>();
  for (const r of renglones) {
    sugerencias.set(normalizar(r.description), { description: r.description, unitPrice: r.unitPrice, salePrice: r.salePrice });
  }
  const formulario = {
    supplierId: p.id,
    proveedor: p.name,
    hoy,
    currency: cur,
    sugerencias: [...sugerencias.values()],
    conDescuento,
    conVenta,
    // La compra nueva arranca con el IVA de la ultima: cada proveedor factura igual siempre.
    iva: p.compras.at(-1)?.iva ?? 0,
  };

  return (
    <Card
      title={p.name}
      subtitle={[p.phone, p.notes].filter(Boolean).join(" · ") || undefined}
      action={<CompraBoton {...formulario} />}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Resumen label="Comprado" value={dinero(p.comprado, cur)} />
        <Resumen label="Pagado" value={dinero(p.pagado, cur)} className="text-good" />
        <Resumen label="Falta por pagar" value={dinero(p.saldo, cur)} className={p.saldo > 0.004 ? "text-bad" : "text-good"} />
        {conVenta && <Resumen label="Ganancia" value={dinero(ganancia, cur)} className="text-brand-600" />}
      </div>

      {p.compras.length === 0 ? (
        <div className="mt-4">
          <Empty title={"Todavía no hay compras a " + p.name} hint="Toca Nueva compra para anotar la primera." />
        </div>
      ) : (
        <>
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-subtle sm:hidden">
          Desliza la tabla hacia la derecha para ver el total y el estado →
        </p>
        <div className="mt-1.5 overflow-x-auto rounded-lg border border-black/60 bg-white text-black sm:mt-4" data-hoja-proveedor>
          <table className="w-full min-w-[620px] border-collapse text-[12px] [&_td]:border [&_td]:border-black/50 [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-black/60 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left [&_th]:font-bold">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>CANTIDAD</th>
                <th>DESCRIPCIÓN</th>
                <th>PRECIO UNI</th>
                {conDescuento && <th>DESCUENTO</th>}
                <th>SUBTOTAL</th>
                <th>TOTAL</th>
                <th>ESTADO</th>
                {conVenta && (
                  <>
                    <th>PRECIO VENTA</th>
                    <th>SUBTOTAL</th>
                    <th>TOTAL</th>
                    <th>GANANCIA</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {p.compras.map((c) =>
                c.renglones.map((r, i) => {
                  const n = c.renglones.length;
                  const venta = ventaDe(r);
                  return (
                    <tr key={r.id} className="bg-[#e2efda]" data-compra={i === 0 ? c.id : undefined}>
                      {i === 0 && (
                        <td rowSpan={n} className="w-28 text-center align-middle">
                          <span className="block font-semibold">{shortDay(c.day)}</span>
                          {c.document && <span className="block text-[10px]">{c.document}</span>}
                          {c.notes && <span className="block text-[10px] italic">{c.notes}</span>}
                          <span className="mt-1.5 flex flex-wrap justify-center gap-1">
                            <PagosCompra
                              billId={c.id}
                              proveedor={p.name}
                              total={c.total}
                              falta={c.falta}
                              pagos={c.pagos}
                              hoy={hoy}
                              currency={cur}
                            />
                            <CompraBoton
                              {...formulario}
                              compra={{ id: c.id, day: c.day, document: c.document, notes: c.notes, taxPct: c.iva, items: c.renglones }}
                            />
                            <form action={borrarCompraAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <BotonBorrar
                                ariaLabel="Borrar compra"
                                aviso={{
                                  titulo: "¿Borrar esta compra?",
                                  que: [p.name + " · " + shortDay(c.day), "Total " + dinero(c.total, cur)],
                                  efectos: [
                                    "Se borran sus " + n + (n === 1 ? " renglón" : " renglones") +
                                      (c.pagos.length ? " y sus " + c.pagos.length + " pagos" : "") + ".",
                                  ],
                                }}
                              >
                                <Icon name="trash" className="h-3.5 w-3.5" />
                              </BotonBorrar>
                            </form>
                          </span>
                        </td>
                      )}
                      <td className="text-center">{cifra(r.qty)}</td>
                      <td>{r.description}</td>
                      <td className="text-center">{r.unitPrice ? cifra(r.unitPrice) : ""}</td>
                      {conDescuento && <td className="text-center">{r.discount ? cifra(r.discount) : ""}</td>}
                      <td className="text-right">{cifra(subtotalDe(r))}</td>
                      {i === 0 && (
                        <td rowSpan={n} className="text-center align-middle font-semibold" data-total-compra>
                          {cifra(c.total)}
                          {c.iva > 0 && <span className="block text-[10px] font-normal">con IVA {cifra(c.iva)}%</span>}
                        </td>
                      )}
                      {i === 0 && (
                        <td rowSpan={n} className="text-center align-middle" data-estado={c.estado}>
                          <span className={"font-bold " + (c.estado === "CANCELADO" ? "text-[#375623]" : "text-[#c00000]")}>
                            {c.estado}
                          </span>
                          {c.estado === "PENDIENTE" && c.pagado > 0 && (
                            <span className="block text-[10px]">Falta {cifra(c.falta)}</span>
                          )}
                        </td>
                      )}
                      {conVenta && (
                        <>
                          <td className="text-center">{r.salePrice !== null ? cifra(r.salePrice) : ""}</td>
                          <td className="text-right">{venta !== null ? cifra(venta) : ""}</td>
                          {i === 0 && (
                            <td rowSpan={n} className="text-center align-middle font-semibold">
                              {c.totalVenta !== null ? cifra(c.totalVenta) : ""}
                            </td>
                          )}
                          {i === 0 && (
                            <td rowSpan={n} className="text-center align-middle font-semibold">
                              {c.ganancia !== null ? cifra(c.ganancia) : ""}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td />
                <td colSpan={conDescuento ? 5 : 4} className="text-center">
                  TOTAL
                </td>
                <td className="bg-[#ffff00] text-center" data-total-proveedor>
                  {cifra(p.comprado)}
                </td>
                <td />
                {conVenta && (
                  <>
                    <td colSpan={2} />
                    <td className="bg-[#ffff00] text-center">{cifra(totalVenta)}</td>
                    <td className="bg-[#ffff00] text-center">{cifra(ganancia)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      )}

      <div className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-600">
            <Icon name="pencil" className="h-3.5 w-3.5" />
            Editar proveedor
          </summary>
          <div className="mt-2">
            <ProveedorForm proveedor={{ id: p.id, name: p.name, phone: p.phone, notes: p.notes }} />
          </div>
        </details>
        <form action={borrarProveedorAction} className="sm:text-right">
          <input type="hidden" name="id" value={p.id} />
          <BotonBorrar
            className="btn-ghost btn-sm text-bad"
            ariaLabel="Borrar proveedor"
            aviso={{
              titulo: "¿Borrar a " + p.name + "?",
              que: [p.compras.length + (p.compras.length === 1 ? " compra" : " compras") + " por " + dinero(p.comprado, cur)],
              efectos: ["Se borran todas sus compras y sus pagos. No se puede deshacer."],
            }}
          >
            <Icon name="trash" className="h-4 w-4" />
            Borrar proveedor
          </BotonBorrar>
        </form>
      </div>
    </Card>
  );
}

function Resumen({ label, value, className = "text-strong" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={"text-sm font-bold " + className}>{value}</p>
    </div>
  );
}
