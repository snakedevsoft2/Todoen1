"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { leerSpots, spotPorDefecto, type Spot } from "@/lib/firma-spots";
import { Icon } from "../Icon";
import { PadFirma } from "./PadFirma";
import { VisorFirmas } from "./VisorFirmas";

type Doc = { id: string; name: string; pages: number; spots: string | null };

/**
 * Lo que hace el cliente en su enlace: su firma, ponerla donde va en cada
 * documento y confirmar con su nombre. El PDF firmado lo arma el servidor.
 */
export function FirmarDocumentos({
  token,
  documentos,
  nombre,
  fuentes,
}: {
  token: string;
  documentos: Doc[];
  nombre: string;
  fuentes: { etiqueta: string; familia: string }[];
}) {
  const router = useRouter();
  const [firma, setFirma] = useState<string | null>(null);
  const [editandoFirma, setEditandoFirma] = useState(true);
  const [actual, setActual] = useState(0);
  // Donde marco el negocio; si no marco nada, abajo a la derecha de la ultima pagina.
  const [lugares, setLugares] = useState<Record<string, Spot[]>>(() =>
    Object.fromEntries(
      documentos.map((d) => {
        const marcados = leerSpots(d.spots, d.pages);
        return [d.id, marcados.length ? marcados : [spotPorDefecto(d.pages)]];
      })
    )
  );
  const [nombreFirma, setNombreFirma] = useState(nombre);
  const [cedula, setCedula] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doc = documentos[actual];
  const sinLugar = documentos.filter((d) => (lugares[d.id] ?? []).length === 0);

  async function enviar() {
    setError(null);
    if (!firma) return setError("Primero haz tu firma (paso 1).");
    if (nombreFirma.trim().length < 3) return setError("Escribe tu nombre completo.");
    if (!acepto) return setError("Marca la casilla para aceptar la firma electrónica.");
    setEnviando(true);
    try {
      const r = await fetch("/api/firmar/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: firma, name: nombreFirma, docNumber: cedula, accept: true, lugares }),
      });
      const datos = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(datos.error ?? "No se pudo firmar. Intenta otra vez.");
        setEnviando(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta otra vez.");
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg text-strong">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm text-on-brand">1</span>
          Haz tu firma
        </h2>
        {editandoFirma || !firma ? (
          <PadFirma
            nombre={nombre}
            fuentes={fuentes}
            onListo={(png) => {
              setFirma(png);
              setEditandoFirma(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={firma} alt="Tu firma" className="h-20 max-w-full rounded-xl border border-line bg-white object-contain p-2" />
            <button type="button" onClick={() => setEditandoFirma(true)} className="btn-ghost btn-sm">
              <Icon name="pencil" className="h-4 w-4" /> Cambiar firma
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg text-strong">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm text-on-brand">2</span>
          Revisa y pon tu firma donde va
        </h2>
        <p className="mb-3 text-[13px] text-muted">
          Arrastra la firma con el dedo para moverla. Para agrandarla o achicarla, arrastra el punto de la esquina. Puedes
          agregar más firmas con «Firma en esta página».
        </p>

        {documentos.length > 1 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {documentos.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActual(i)}
                className={"btn-sm shrink-0 " + (i === actual ? "btn-primary" : "btn-ghost")}
              >
                {i + 1}. {d.name}
              </button>
            ))}
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-strong">{doc.name}</p>
          <a href={"/firmar/" + token + "/pdf/" + doc.id} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
            <Icon name="eye" className="h-4 w-4" /> Abrir PDF
          </a>
        </div>
        <VisorFirmas
          key={doc.id}
          url={"/firmar/" + token + "/pdf/" + doc.id}
          paginas={doc.pages}
          spots={lugares[doc.id] ?? []}
          onChange={(s) => setLugares((l) => ({ ...l, [doc.id]: s }))}
          firma={firma}
        />
        {documentos.length > 1 && actual < documentos.length - 1 && (
          <button type="button" onClick={() => setActual(actual + 1)} className="btn-soft mt-3 w-full">
            Siguiente documento <Icon name="play" className="h-4 w-4" />
          </button>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg text-strong">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm text-on-brand">3</span>
          Confirma y firma
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Nombre completo</span>
            <input className="input" value={nombreFirma} onChange={(e) => setNombreFirma(e.target.value)} maxLength={120} autoComplete="name" />
          </label>
          <label className="block">
            <span className="label">Documento de identidad (opcional)</span>
            <input className="input" value={cedula} onChange={(e) => setCedula(e.target.value)} maxLength={40} inputMode="numeric" />
          </label>
        </div>
        {sinLugar.length > 0 && (
          <p className="mt-3 rounded-xl bg-surface p-3 text-[13px] text-muted">
            {sinLugar.map((d) => d.name).join(", ")} no tiene la firma puesta: se firmará abajo a la derecha de la última página.
          </p>
        )}
        <label className="mt-3 flex items-start gap-2 text-[13px] text-body">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            Leí {documentos.length === 1 ? "el documento" : "los " + documentos.length + " documentos"} y acepto firmarlos
            electrónicamente. Mi firma, la fecha, la hora y desde dónde firmo quedan guardadas como constancia.
          </span>
        </label>
        {error && <p className="mt-3 text-sm font-semibold text-bad">{error}</p>}
        <button type="button" onClick={enviar} disabled={enviando} className="btn-primary mt-4 w-full">
          <Icon name="check" className="h-5 w-5" />
          {enviando ? "Firmando…" : documentos.length === 1 ? "Firmar documento" : "Firmar los " + documentos.length + " documentos"}
        </button>
      </section>
    </div>
  );
}
