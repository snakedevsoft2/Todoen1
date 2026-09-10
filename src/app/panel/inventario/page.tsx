import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { photoUrl } from "@/lib/nav";
import { variantLabel, getInventorySummary, type InventorySummary } from "@/lib/inventory";
import { normalizeCode } from "@/lib/variants";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { StockMoveForm, type MovableVariant } from "@/components/StockMoveForm";
import { InventorySearch } from "@/components/InventorySearch";
import { quickStockAction } from "@/actions/inventory";

export const dynamic = "force-dynamic";

const MOVE_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Conteo",
  VENTA: "Venta",
  DEVOLUCION: "Devolucion",
};

/** Cuantas prendas quedan y de que color pintarlo. */
function stockTone(stock: number, minStock: number) {
  if (stock <= 0) return { tone: "bad" as const, text: "Agotado" };
  if (stock <= minStock) return { tone: "amber" as const, text: "Quedan pocas" };
  return { tone: "good" as const, text: "" };
}

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; filtro?: string; v?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayIn(user.timezone);

  const query = (params.q ?? "").trim().toLowerCase();
  const category = (params.cat ?? "").trim();
  const filtro = params.filtro === "bajo" || params.filtro === "agotado" ? params.filtro : "todos";

  const [services, summary, moves, suppliers] = await Promise.all([
    db.service.findMany({
      where: { userId: user.id, trackStock: true },
      include: {
        variants: { orderBy: [{ active: "desc" }, { size: "asc" }, { color: "asc" }] },
      },
      orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
    }),
    getInventorySummary(user.id),
    db.stockMove.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { variant: { include: { service: { select: { name: true } } } } },
    }),
    db.supplier.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const categories = [...new Set(services.map((s) => s.category))].sort();

  // Los filtros se aplican en memoria: un negocio maneja decenas de prendas,
  // no miles, y asi la busqueda cubre nombre, marca, talla, color y codigo.
  const visible = services
    .map((service) => {
      const variants = service.variants.filter((v) => {
        if (filtro === "agotado" && v.stock > 0) return false;
        if (filtro === "bajo" && v.stock > v.minStock) return false;
        if (!query) return true;
        const haystack = [
          service.name,
          service.brand ?? "",
          service.category,
          v.size,
          v.color,
          v.sku ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
      return { service, variants };
    })
    .filter(({ service, variants }) => {
      if (category && service.category !== category) return false;
      return variants.length > 0;
    });

  // Prendas creadas a las que todavia no les cargaron tallas: no salen en la
  // lista de arriba porque no tienen nada que contar, pero hay que decirlo.
  const sinTallas = services.filter((s) => s.active && s.variants.length === 0);
  const filtering = Boolean(query || category || filtro !== "todos");

  const movable: MovableVariant[] = services.flatMap((service) =>
    service.variants
      .filter((v) => v.active)
      .map((v) => ({
        id: v.id,
        serviceName: service.name,
        label: variantLabel(v),
        stock: v.stock,
        cost: v.cost,
        sku: v.sku,
      }))
  );

  // Si lo que buscaron es exactamente el codigo de una talla (o sea, alguien
  // escaneo), la dejamos elegida en "Mover stock" para no repetir el trabajo.
  const codigoBuscado = normalizeCode(params.q ?? "");
  const porCodigo = codigoBuscado
    ? services.flatMap((s) => s.variants).find((v) => v.sku === codigoBuscado)
    : undefined;
  const preseleccion = params.v ?? porCodigo?.id;

  const filters = [
    { key: "todos", label: "Todas" },
    { key: "bajo", label: "Por acabarse (" + summary.lowCount + ")" },
    { key: "agotado", label: "Agotadas (" + summary.outCount + ")" },
  ];

  const keepQuery = (extra: Record<string, string>) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", params.q ?? "");
    if (category) sp.set("cat", category);
    if (filtro !== "todos") sp.set("filtro", filtro);
    for (const [k, value] of Object.entries(extra)) {
      if (value) sp.set(k, value);
      else sp.delete(k);
    }
    const s = sp.toString();
    return "/panel/inventario" + (s ? "?" + s : "");
  };

  return (
    <>
      <PageHeader title="Inventario" subtitle="Cuanta ropa tienes, por talla y por color">
        <Link href="/panel/catalogo" className="btn-primary btn-sm">
          <Icon name="plus" className="h-4 w-4" />
          Agregar prenda
        </Link>
      </PageHeader>

      <InventoryStats summary={summary} currency={user.currency} />

      {summary.lowCount + summary.outCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span>
            Tienes {summary.outCount} {summary.outCount === 1 ? "talla agotada" : "tallas agotadas"} y{" "}
            {summary.lowCount} por acabarse.
          </span>
          <Link href={keepQuery({ filtro: "bajo" })} className="link ml-auto">
            Ver cuales
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Card title="Buscar o escanear">
            <InventorySearch
              categories={categories}
              defaultQuery={params.q ?? ""}
              defaultCategory={category}
              filtro={filtro}
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {filters.map((f) => (
                <Link
                  key={f.key}
                  href={keepQuery({ filtro: f.key === "todos" ? "" : f.key })}
                  className={filtro === f.key ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </Card>

          {sinTallas.length > 0 && !filtering && (
            <Card
              title="Prendas sin tallas"
              subtitle="Ya estan en tu catalogo, pero todavia no tienen stock que contar"
              action={
                <Link href="/panel/catalogo" className="btn-primary btn-sm">
                  Agregar tallas
                </Link>
              }
            >
              <ul className="flex flex-wrap gap-2">
                {sinTallas.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-dashed border-line bg-surface px-2.5 py-1.5 text-xs text-body"
                  >
                    {s.name}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-subtle">
                Abre la prenda en Productos y usa <strong>Crear en lote</strong> para cargar S, M, L
                y XL de una vez.
              </p>
            </Card>
          )}

          {visible.length === 0 ? (
            <Card>
              <Empty
                title={
                  services.length === 0
                    ? "Todavia no tienes prendas con inventario"
                    : filtering
                      ? "Nada coincide con esa busqueda"
                      : "Tus prendas todavia no tienen tallas"
                }
                hint={
                  services.length === 0
                    ? "Crea una prenda en Productos, marcala para llevar inventario y agregale sus tallas."
                    : filtering
                      ? "Prueba con otro nombre, otra talla o quita los filtros."
                      : "Agregales las tallas desde Productos y aqui las cargas con su stock."
                }
              />
            </Card>
          ) : (
            visible.map(({ service, variants }) => {
              const photo = photoUrl(service.id, service.image, service.updatedAt);
              const totalStock = variants.reduce((s, v) => s + Math.max(0, v.stock), 0);

              return (
                <Card key={service.id}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo}
                          alt={service.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Icon name="shirt" className="h-7 w-7 text-subtle" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-strong">
                        {service.name}
                        {!service.active && <Badge tone="red">Inactiva</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {service.category}
                        {service.brand ? " - " + service.brand : ""} -{" "}
                        {money(service.price, user.currency)}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {totalStock} {totalStock === 1 ? "prenda" : "prendas"} en{" "}
                        {variants.length} {variants.length === 1 ? "talla" : "tallas"}
                      </p>
                    </div>

                    <Link href="/panel/catalogo" className="btn-ghost btn-sm">
                      Editar prenda
                    </Link>
                  </div>

                  <ul className="mt-3 divide-y divide-line border-t border-line">
                    {variants.map((v) => {
                      const state = stockTone(v.stock, v.minStock);
                      return (
                        <li
                          key={v.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-strong">
                              {variantLabel(v)}
                              {state.text && (
                                <Badge tone={v.stock <= 0 ? "red" : "amber"}>{state.text}</Badge>
                              )}
                              {!v.active && <Badge>Inactiva</Badge>}
                            </p>
                            <p className="text-[11px] text-subtle">
                              {v.sku ? "Cod " + v.sku + " - " : ""}
                              minimo {v.minStock}
                              {v.cost > 0 ? " - costo " + money(v.cost, user.currency) : ""}
                              {v.price !== null ? " - precio " + money(v.price, user.currency) : ""}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <form action={quickStockAction}>
                              <input type="hidden" name="variantId" value={v.id} />
                              <input type="hidden" name="delta" value="-1" />
                              <SubmitButton
                                className="btn-ghost btn-sm px-2.5"
                                pendingText="..."
                                ariaLabel="Quitar una"
                                disabled={v.stock <= 0}
                              >
                                -
                              </SubmitButton>
                            </form>

                            <span
                              className={
                                "w-10 text-center text-base font-bold " +
                                (state.tone === "bad"
                                  ? "text-bad"
                                  : state.tone === "amber"
                                    ? "text-warn"
                                    : "text-strong")
                              }
                            >
                              {v.stock}
                            </span>

                            <form action={quickStockAction}>
                              <input type="hidden" name="variantId" value={v.id} />
                              <input type="hidden" name="delta" value="1" />
                              <SubmitButton
                                className="btn-ghost btn-sm px-2.5"
                                pendingText="..."
                                ariaLabel="Agregar una"
                              >
                                +
                              </SubmitButton>
                            </form>

                            <Link href={keepQuery({ v: v.id }) + "#mover"} className="btn-ghost btn-sm">
                              Mover
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          <div id="mover">
            <Card title="Mover stock" subtitle="Entradas, salidas y conteo fisico">
              {/* La key cambia con la talla preseleccionada para que el
                  formulario se vuelva a montar: al escanear se navega sin
                  recargar y, sin esto, React conservaria la talla anterior. */}
              <StockMoveForm
                key={preseleccion ?? "sin-preseleccion"}
                variants={movable}
                today={today}
                defaultVariantId={preseleccion}
                suppliers={suppliers}
              />
            </Card>
          </div>

          <Card title="Ultimos movimientos" subtitle="Todo queda anotado con su motivo">
            {moves.length === 0 ? (
              <Empty title="Todavia no hay movimientos" hint="Carga la mercancia que ya tienes." />
            ) : (
              <ul className="divide-y divide-line">
                {moves.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-strong">
                        {m.variant.service.name} - {variantLabel(m.variant)}
                      </p>
                      <p className="text-[11px] text-subtle">
                        {MOVE_LABEL[m.type] ?? m.type} - {shortDay(m.day)}
                        {m.reason ? " - " + m.reason : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={
                          "text-sm font-bold " + (m.delta >= 0 ? "text-good" : "text-bad")
                        }
                      >
                        {m.delta > 0 ? "+" : ""}
                        {m.delta}
                      </span>
                      <p className="text-[11px] text-subtle">quedaron {m.stockAfter}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function InventoryStats({
  summary,
  currency,
}: {
  summary: InventorySummary;
  currency: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Prendas en tienda"
        value={String(summary.units)}
        hint={summary.variantCount + " tallas distintas"}
        tone="brand"
      />
      <Stat
        label="Valor al costo"
        value={money(summary.costValue, currency)}
        hint="Lo que te costo la mercancia"
      />
      <Stat
        label="Valor de venta"
        value={money(summary.saleValue, currency)}
        hint="Si vendieras todo"
        tone="good"
      />
      <Stat
        label="Tallas en rojo"
        value={String(summary.lowCount + summary.outCount)}
        hint={summary.outCount + " agotadas"}
        tone={summary.lowCount + summary.outCount > 0 ? "bad" : "default"}
      />
    </div>
  );
}
