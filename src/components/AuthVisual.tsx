import { Logo } from "./Logo";
import { Icon } from "./Icon";

/**
 * Lado visual del ingreso.
 *
 * No es una ilustracion: es un pedazo del panel de verdad, con las cifras que
 * el negocio ve todos los dias. La idea es que quien llega entienda en dos
 * segundos que se lleva, sin fotos de gente en traje ni dibujos de archivo.
 *
 * Las cifras son de muestra y estan quietas a proposito. Aqui no hay nada que
 * mirar moverse: la persona vino a entrar.
 */
const METRICAS = [
  { label: "Ventas del día", valor: "$ 1.284.000", delta: "+12%", sube: true },
  { label: "Clientes", valor: "348", delta: "+9", sube: true },
  { label: "Inventario", valor: "1.926", delta: "12 bajos", sube: false },
];

/** Ingresos de la semana, en alturas relativas. */
const BARRAS = [38, 52, 44, 67, 58, 81, 72];
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

const MOVIMIENTOS = [
  { icon: "receipt", texto: "Venta · Camisa de lino M", valor: "$ 85.000", tono: "text-emerald-600" },
  { icon: "box", texto: "Entrada · 24 unidades", valor: "Inventario", tono: "text-slate-500" },
  { icon: "wallet", texto: "Gasto · Proveedor", valor: "-$ 320.000", tono: "text-rose-600" },
];

export function AuthVisual() {
  return (
    <div className="flex h-full flex-col justify-between gap-10 p-10 xl:p-14">
      <Logo className="h-10 w-10" />

      <div>
        <h2 className="max-w-md text-[34px] font-bold leading-[1.12] tracking-[-0.02em] text-slate-900 xl:text-[40px]">
          Todo tu negocio.
          <br />
          En un solo lugar.
        </h2>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-slate-500">
          Ventas, clientes, inventario y finanzas, simplificados.
        </p>

        {/* Fragmento del panel. Las lineas finas sugieren que todo esta conectado. */}
        <div className="relative mt-10 max-w-md">
          <div className="grid grid-cols-3 gap-3">
            {METRICAS.map((m) => (
              <div key={m.label} className="auth-tile">
                <p className="text-[11px] font-medium text-slate-500">{m.label}</p>
                <p className="mt-1.5 text-[17px] font-bold tracking-[-0.01em] text-slate-900 num">
                  {m.valor}
                </p>
                <p
                  className={
                    "mt-1 text-[11px] font-medium " +
                    (m.sube ? "text-emerald-600" : "text-amber-600")
                  }
                >
                  {m.delta}
                </p>
              </div>
            ))}
          </div>

          {/* Conector entre las cifras y el grafico */}
          <div className="mx-auto h-5 w-px bg-slate-200" aria-hidden="true" />

          <div className="auth-tile">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-medium text-slate-500">
                Ingresos · últimos 7 días
              </p>
              <p className="text-[13px] font-bold text-slate-900 num">$ 7.940.000</p>
            </div>

            {/* La columna tiene que ocupar todo el alto: si no, el porcentaje
                de cada barra se calcula contra cero y no se ve nada. */}
            <div className="mt-4 flex h-24 items-stretch gap-2" aria-hidden="true">
              {BARRAS.map((alto, i) => (
                <div key={i} className="flex flex-1 flex-col justify-end gap-1.5">
                  <div
                    className={
                      "w-full rounded-[3px] " +
                      (i === BARRAS.length - 2 ? "bg-slate-900" : "bg-slate-200")
                    }
                    style={{ height: alto + "%" }}
                  />
                  <span className="text-center text-[9px] font-medium text-slate-400">
                    {DIAS[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto h-5 w-px bg-slate-200" aria-hidden="true" />

          <div className="auth-tile p-0">
            <ul className="divide-y divide-slate-100">
              {MOVIMIENTOS.map((m) => (
                <li key={m.texto} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-slate-100 text-slate-500">
                    <Icon name={m.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">
                    {m.texto}
                  </span>
                  <span className={"shrink-0 text-[12px] font-semibold num " + m.tono}>
                    {m.valor}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="text-[12px] text-slate-400">
        Un negocio, un usuario. Tus datos no los ve nadie más.
      </p>
    </div>
  );
}
