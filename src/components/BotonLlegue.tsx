"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarVisita, nuevaLlave, subirVisitas } from "@/lib/cola-pendientes";
import { ubicar } from "@/lib/ubicar";
import { Icon } from "./Icon";

type Sitio = { id: string; name: string };

/**
 * "Llegué": marcar que se llegó a un cliente, una obra o un sitio.
 *
 * Igual que el marcaje: se guarda primero en el telefono con la hora y la
 * ubicacion, y se sube cuando hay senal. El administrador lo ve en la Planilla.
 */
export function BotonLlegue({ cuenta, sitios }: { cuenta: string; sitios: Sitio[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [sitioId, setSitioId] = useState(sitios[0]?.id ?? "");
  const [lugar, setLugar] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const subir = useCallback(async () => {
    const r = await subirVisitas(cuenta).catch(() => null);
    if (!r) return;
    if (r.rechazados.length > 0) {
      setAviso({ tono: "error", texto: "No se pudo registrar una llegada: " + (r.rechazados[0].motivo ?? "") });
    } else if (r.enviados > 0 && navigator.onLine) {
      router.refresh();
    }
  }, [cuenta, router]);

  useEffect(() => {
    void subir();
    const volvio = () => void subir();
    window.addEventListener("online", volvio);
    return () => window.removeEventListener("online", volvio);
  }, [subir]);

  const otroLugar = sitios.length === 0 || sitioId === "";

  async function marcar() {
    if (otroLugar && !lugar.trim()) {
      setAviso({ tono: "error", texto: "Escribe a dónde llegaste." });
      return;
    }
    setOcupado(true);
    setAviso(null);
    const p = await ubicar();
    try {
      await guardarVisita({
        clientKey: nuevaLlave(),
        cuenta,
        arrivedAt: new Date().toISOString(),
        siteId: otroLugar ? null : sitioId,
        place: otroLugar ? lugar.trim() : "",
        note: nota.trim(),
        lat: p?.coords.latitude ?? null,
        lng: p?.coords.longitude ?? null,
        accuracyM: p ? Math.round(p.coords.accuracy) : null,
        creadoEn: new Date().toISOString(),
      });
    } catch {
      setOcupado(false);
      setAviso({ tono: "error", texto: "Este navegador no deja guardar la llegada. Prueba con Chrome o Safari normal." });
      return;
    }
    const hora = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    setAviso({
      tono: "ok",
      texto:
        "Llegada registrada a las " +
        hora +
        (p ? " con tu ubicación" : " sin ubicación") +
        (navigator.onLine ? "." : ". Sin señal: se envía sola cuando vuelva."),
    });
    setAbierto(false);
    setLugar("");
    setNota("");
    setOcupado(false);
    void subir();
  }

  return (
    <div className="space-y-2" data-llegue>
      {!abierto ? (
        <button type="button" className="btn-ghost w-full" onClick={() => setAbierto(true)}>
          <Icon name="map" className="h-4 w-4" />
          Llegué a una visita
        </button>
      ) : (
        <div className="space-y-2.5 rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-bold text-strong">¿A dónde llegaste?</p>
          {sitios.length > 0 && (
            <select className="input" aria-label="Sitio" value={sitioId} onChange={(e) => setSitioId(e.target.value)} disabled={ocupado}>
              {sitios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="">Otro lugar</option>
            </select>
          )}
          {otroLugar && (
            <input
              className="input"
              aria-label="Lugar"
              placeholder="Ej: Donde el cliente Pedro Gómez"
              maxLength={120}
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              disabled={ocupado}
            />
          )}
          <input
            className="input"
            aria-label="Nota"
            placeholder="Nota (opcional)"
            maxLength={300}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={ocupado}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={marcar} disabled={ocupado}>
              {ocupado ? "Tomando tu ubicación…" : "Marcar llegada"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAbierto(false)} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {aviso && <p className={"text-[12px] " + (aviso.tono === "ok" ? "text-good" : "text-bad")}>{aviso.texto}</p>}
    </div>
  );
}
