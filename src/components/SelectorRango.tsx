"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { MONTHS, prettyDay, shortDay } from "@/lib/format";
import { atajosDeRango, diasDelCalendario, mesVecino, tocarDia, type Eleccion } from "@/lib/rango-fechas";

const SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Un solo calendario para elegir un rango: se toca el dia "desde" y luego el
 * dia "hasta", y queda pintado lo del medio. "Ver" lleva a
 * `basePath?desde=...&hasta=...`. Con un solo dia tocado, "Ver" muestra ese dia.
 *
 * Lo pidio Chopo Snacks para Gastos (ver esChopoSnacks).
 */
export function SelectorRango({
  basePath,
  desde,
  hasta,
  hoy,
}: {
  basePath: string;
  desde: string;
  hasta: string;
  hoy: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [eleccion, setEleccion] = useState<Eleccion>({ desde, hasta });
  const [mes, setMes] = useState(hasta.slice(0, 7));
  // En la computadora, al pasar el mouse se ve como quedaria el rango.
  const [encima, setEncima] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);

  // Al cambiar de pagina, el calendario vuelve a lo que se esta viendo.
  useEffect(() => {
    setEleccion({ desde, hasta });
    setMes(hasta.slice(0, 7));
  }, [desde, hasta]);

  useEffect(() => {
    if (!abierto) return;
    // En el celular el calendario queda por debajo de la pantalla: se baja
    // lo justo para que se vea entero, con el boton Ver.
    calRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    function fuera(e: PointerEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  function ir(d: string, h: string) {
    setAbierto(false);
    startTransition(() => router.push(basePath + "?desde=" + d + "&hasta=" + h));
  }

  function abrir() {
    setEleccion({ desde, hasta });
    setMes(hasta.slice(0, 7));
    setAbierto((a) => !a);
  }

  // El rango pintado: lo elegido, o lo que quedaria con el dia bajo el mouse.
  const inicio = eleccion.desde;
  const otro = eleccion.hasta ?? (inicio ? encima : null);
  const [a, b] = inicio && otro ? (otro < inicio ? [otro, inicio] : [inicio, otro]) : [inicio, inicio];

  const [y, m] = mes.split("-").map(Number);
  const dias = diasDelCalendario(mes);
  const paso = !eleccion.desde
    ? "Toca el día desde"
    : !eleccion.hasta
      ? "Ahora toca el día hasta"
      : "Listo. Toca Ver, o toca otro día para empezar de nuevo";

  return (
    <div ref={cajaRef} className="relative w-full sm:ml-auto sm:w-auto" data-rango-gastos>
      <button
        type="button"
        onClick={abrir}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className={
          "flex w-full items-center gap-3 rounded-xl border bg-panel px-3 py-2 text-left transition-colors sm:w-auto " +
          (abierto ? "border-brand-500 shadow-focus-brand" : "border-line hover:border-line-strong") +
          (pending ? " opacity-60" : "")
        }
      >
        <Icon name="calendar" className="h-5 w-5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-tight text-muted">Desde</span>
          <span className="block text-sm font-semibold text-strong" data-desde>
            {shortDay(desde)}
          </span>
        </span>
        <span className="text-subtle" aria-hidden>
          →
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-tight text-muted">Hasta</span>
          <span className="block text-sm font-semibold text-strong" data-hasta>
            {shortDay(hasta)}
          </span>
        </span>
        <Icon
          name="chevronDown"
          className={"h-4 w-4 shrink-0 text-muted transition-transform " + (abierto ? "rotate-180" : "")}
        />
      </button>

      {abierto && (
        <div
          ref={calRef}
          role="dialog"
          aria-label="Elegir desde y hasta"
          className="absolute right-0 top-full z-40 mt-2 w-full rounded-2xl border border-line bg-panel p-3 shadow-card-hover sm:w-[330px]"
          data-calendario-rango
        >
          {/* Lo elegido: desde y hasta. Se resalta el que toca elegir ahora. */}
          <div className="mb-2 grid grid-cols-2 gap-2">
            {(["desde", "hasta"] as const).map((campo) => {
              // Sin nada, toca el desde; con el desde, toca el hasta; con los dos, quedan los dos marcados.
              const toca = campo === "desde" ? !eleccion.desde || !!eleccion.hasta : !!eleccion.desde;
              const valor = eleccion[campo];
              return (
                <div
                  key={campo}
                  className={
                    "rounded-xl border px-2.5 py-1.5 " +
                    (toca ? "border-brand-500 bg-brand-50" : "border-line bg-surface")
                  }
                >
                  <p className="text-[11px] capitalize leading-tight text-muted">{campo}</p>
                  <p className="text-sm font-semibold text-strong">{valor ? shortDay(valor) : "—"}</p>
                </div>
              );
            })}
          </div>
          <p className="mb-2 text-xs text-muted" aria-live="polite">
            {paso}
          </p>

          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-strong">
              {MONTHS[m - 1]} de {y}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-strong hover:bg-surface"
                aria-label="Mes anterior"
                onClick={() => setMes(mesVecino(mes, -1))}
              >
                <Icon name="chevronDown" className="h-4 w-4 rotate-90" />
              </button>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-strong hover:bg-surface"
                aria-label="Mes siguiente"
                onClick={() => setMes(mesVecino(mes, 1))}
              >
                <Icon name="chevronDown" className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          </div>

          <div className="mt-1 grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
            {SEMANA.map((d) => (
              <span key={d} className="py-1.5">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1" onPointerLeave={() => setEncima(null)}>
            {dias.map((dia, i) => {
              const delMes = dia.slice(0, 7) === mes;
              const extremo = dia === a || dia === b;
              const enMedio = !!a && !!b && dia > a && dia < b;
              const lunes = i % 7 === 0;
              const domingo = i % 7 === 6;
              // La franja del rango: redondeada en las puntas y al cortar la semana.
              const franja =
                a && b && a !== b && dia >= a && dia <= b
                  ? "bg-brand-100 " +
                    (dia === a || lunes ? "rounded-l-lg " : "") +
                    (dia === b || domingo ? "rounded-r-lg" : "")
                  : "";
              return (
                <div key={dia} className={franja}>
                  <button
                    type="button"
                    data-dia={dia}
                    aria-label={prettyDay(dia)}
                    aria-pressed={extremo}
                    onClick={() => setEleccion((e) => tocarDia(e, dia))}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setEncima(dia)}
                    className={
                      "h-10 w-full rounded-lg text-sm transition-colors " +
                      (extremo
                        ? "bg-brand-600 font-bold text-on-brand"
                        : enMedio
                          ? "font-medium text-brand-800 hover:bg-brand-200"
                          : (delMes ? "text-strong " : "text-subtle ") + "hover:bg-surface") +
                      (dia === hoy && !extremo ? " font-bold ring-1 ring-inset ring-brand-500" : "")
                    }
                  >
                    {Number(dia.slice(8))}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {atajosDeRango(hoy).map((r) => (
              <button
                key={r.nombre}
                type="button"
                className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-body hover:border-line-strong hover:bg-surface"
                onClick={() => ir(r.desde, r.hasta)}
              >
                {r.nombre}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setEleccion({ desde: null, hasta: null });
                setEncima(null);
              }}
            >
              Borrar
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => ir(hoy, hoy)}>
                Hoy
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={!eleccion.desde}
                onClick={() => eleccion.desde && ir(eleccion.desde, eleccion.hasta ?? eleccion.desde)}
              >
                Ver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
