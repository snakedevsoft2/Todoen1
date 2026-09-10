"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Empty } from "./ui";
import { Icon } from "./Icon";

export type GuiaTema = {
  key: string;
  href: string;
  label: string;
  icon: string;
  grupo: string;
  short: string;
  long: string;
  example: string | null;
  /** Si esta persona lo tiene encendido en su menu. */
  visible: boolean;
};

/**
 * Quita tildes y pasa a minusculas.
 *
 * Aqui la gente escribe "guia" y no "guía", y "cuanto" y no "cuánto". Si el
 * buscador exige la tilde, no encuentra nada y se siente roto.
 */
function normal(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Palabras que la gente usa y que no aparecen en el texto del apartado.
 *
 * Nadie busca "cartera": busca "fiado" o "me deben". Sin esto el buscador
 * solo sirve para quien ya sabe como se llama lo que busca, que es
 * exactamente quien no necesita la guia.
 */
const SINONIMOS: Record<string, string[]> = {
  ventas: ["vender", "facturar", "factura", "cobrar", "recibo", "vendi"],
  gastos: ["pagar", "compras", "salida", "arriendo", "servicios", "gaste"],
  cartera: ["fiado", "fian", "me deben", "deuda", "deben", "prestado", "abono", "cobro"],
  caja: ["cuadrar", "cierre", "arqueo", "cuadre", "contar la plata"],
  catalogo: ["precios", "lista de precios", "productos", "menu", "carta", "prendas"],
  inventario: ["stock", "existencias", "bodega", "cuanto queda", "codigo de barras", "escanear"],
  turnos: ["citas", "agenda", "reservar", "separar", "horario"],
  cuentas: ["mesas", "mesa", "pedido", "domicilio", "comanda"],
  portafolio: ["pagina", "catalogo publico", "qr", "enlace", "compartir", "landing", "link"],
  reportes: ["estadisticas", "excel", "contador", "informe", "comparar", "ganancia"],
  equipo: ["empleados", "barberos", "vendedores", "usuarios", "comision"],
  proveedores: ["compras", "mayorista", "a quien le compro"],
  asistente: ["ia", "chat", "inteligencia artificial", "preguntar"],
  avisos: ["recordatorio", "recordar", "notificacion", "whatsapp"],
  personalizar: ["logo", "color", "marca", "tema", "oscuro"],
  espacio: ["menu", "botones", "ordenar", "esconder", "apagar"],
  ajustes: ["configuracion", "contrasena", "horario", "datos"],
  soporte: ["ayuda", "problema", "no funciona", "error", "escribir"],
  resumen: ["inicio", "principal", "hoy"],
  guia: ["manual", "ayuda", "como se hace"],
};

export function GuiaBuscador({ temas }: { temas: GuiaTema[] }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const busqueda = normal(q.trim());

  const resultados = useMemo(() => {
    if (!busqueda) return temas;
    return temas.filter((t) => {
      const extras = (SINONIMOS[t.key] ?? []).join(" ");
      const heno = normal(
        [t.label, t.grupo, t.short, t.long, t.example ?? "", extras].join(" ")
      );
      // Cada palabra por separado: "como cobro fiado" tiene que encontrar algo
      // aunque esa frase exacta no este escrita en ninguna parte.
      return busqueda.split(/\s+/).some((palabra) => heno.includes(palabra));
    });
  }, [busqueda, temas]);

  return (
    <div className="space-y-4">
      <Card>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-strong">
            ¿Qué quieres hacer?
          </span>
          <span className="relative block">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="cobrar un fiado, cuadrar la caja, subir una foto..."
              className="input w-full pl-9"
              autoComplete="off"
            />
          </span>
        </label>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {["fiado", "factura", "codigo de barras", "qr", "excel", "cuadrar"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQ(s)}
              className="btn-ghost btn-sm"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {resultados.length === 0 ? (
        <Empty
          title="No encontramos nada con eso"
          hint="Prueba con otra palabra, o escríbenos por Soporte y te decimos cómo se hace."
        />
      ) : (
        <ul className="space-y-3">
          {resultados.map((t) => {
            const desplegado = abierto === t.key;
            return (
              <li key={t.key}>
                <div className="rounded-xl border border-line bg-panel">
                  <button
                    type="button"
                    onClick={() => setAbierto(desplegado ? null : t.key)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                    aria-expanded={desplegado}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-brand-600 text-on-brand">
                      <Icon name={t.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-strong">{t.label}</span>
                        <span className="text-[10px] uppercase tracking-wide text-subtle">
                          {t.grupo}
                        </span>
                        {!t.visible && (
                          <span className="text-[10px] text-muted">(apagado en tu menú)</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-body">
                        {t.short}
                      </span>
                    </span>
                    <span className="mt-1 shrink-0 text-subtle">{desplegado ? "▲" : "▼"}</span>
                  </button>

                  {desplegado && (
                    <div className="border-t-2 border-line px-4 py-3">
                      <p className="text-sm leading-relaxed text-body">{t.long}</p>
                      {t.example && (
                        <p className="mt-2 text-sm italic text-muted">Por ejemplo: {t.example}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={t.href} className="btn-primary btn-sm">
                          Ir a {t.label}
                        </Link>
                        {!t.visible && (
                          <Link href="/panel/espacio" className="btn-ghost btn-sm">
                            Prenderlo en mi menú
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Card title="¿No está aquí lo que buscas?">
        <p className="text-sm text-body">
          Escríbenos por Soporte. Preferimos que preguntes a que dejes de usar la aplicación.
        </p>
        <Link href="/panel/soporte" className="btn-ghost btn-sm mt-3">
          <Icon name="whatsapp" className="h-4 w-4" />
          Escribir a soporte
        </Link>
      </Card>
    </div>
  );
}
