"use client";

import { useState } from "react";
import { leerSpots, type Spot } from "@/lib/firma-spots";
import { VisorFirmas } from "./VisorFirmas";

/**
 * El negocio marca en el documento donde tiene que firmar el cliente. Cada
 * cambio se guarda solo. El cliente vera su firma ahi y la podra mover si hace
 * falta.
 */
export function MarcarLugares({
  docId,
  url,
  paginas,
  spots: inicial,
  editable,
}: {
  docId: string;
  url: string;
  paginas: number;
  spots: string | null;
  editable: boolean;
}) {
  const [spots, setSpots] = useState<Spot[]>(() => leerSpots(inicial, paginas));
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "error">("");

  async function cambiar(nuevos: Spot[]) {
    const antes = spots;
    setSpots(nuevos);
    setEstado("guardando");
    try {
      const r = await fetch("/api/firmas/documentos/" + docId + "/lugares", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spots: nuevos }),
      });
      if (!r.ok) throw new Error();
      setEstado("guardado");
    } catch {
      setSpots(antes);
      setEstado("error");
    }
  }

  return (
    <div>
      {editable && (
        <p className="mb-2 text-[13px] text-muted">
          {spots.length === 0
            ? "Sin lugar marcado: el cliente verá su firma abajo a la derecha de la última página. Toca «Firma en esta página» para marcar dónde va."
            : spots.length + (spots.length === 1 ? " lugar marcado." : " lugares marcados.") + " Arrástralos para moverlos."}{" "}
          <span className={estado === "error" ? "font-semibold text-bad" : "text-subtle"}>
            {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado." : estado === "error" ? "No se guardó. Revisa tu conexión." : ""}
          </span>
        </p>
      )}
      <VisorFirmas url={url} paginas={paginas} spots={spots} onChange={cambiar} editable={editable} />
    </div>
  );
}
