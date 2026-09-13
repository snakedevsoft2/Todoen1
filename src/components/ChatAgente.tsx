"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type Mensaje = { role: "cliente" | "agente" | "error"; text: string };
type Guardado = { id: string; mensajes: Mensaje[] };

function nuevaLlave(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
  }
}

function leer(clave: string): Guardado | null {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? "null");
    if (v && typeof v.id === "string" && Array.isArray(v.mensajes)) return v;
  } catch {
    // Sin almacenamiento (ventana privada): la conversacion vive solo en pantalla.
  }
  return null;
}

function guardar(clave: string, g: Guardado) {
  try {
    localStorage.setItem(clave, JSON.stringify({ id: g.id, mensajes: g.mensajes.slice(-30) }));
  } catch {
    // Igual que arriba: no es grave.
  }
}

/**
 * El chat con el agente.
 *
 * En la pagina publica es una burbuja flotante; en el panel va dentro de la
 * pagina para probarlo. La conversacion se recuerda en el navegador para que
 * el cliente no pierda lo que hablo si recarga, y la verdad vive en el
 * servidor, que es el que guarda el historial que ve el dueño.
 */
export function ChatAgente({
  endpoint,
  negocio,
  saludo,
  almacen,
  flotante = true,
}: {
  endpoint: string;
  negocio: string;
  saludo: string;
  /** Llave para recordar la conversacion en este navegador. */
  almacen: string;
  flotante?: boolean;
}) {
  const clave = "ten_chat_" + almacen;
  const [abierto, setAbierto] = useState(!flotante);
  const [id, setId] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const previo = leer(clave);
    if (previo) {
      setId(previo.id);
      setMensajes(previo.mensajes);
    } else {
      setId(nuevaLlave());
    }
  }, [clave]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, enviando, abierto]);

  useEffect(() => {
    if (abierto && flotante) campo.current?.focus();
  }, [abierto, flotante]);

  async function enviar() {
    const texto = entrada.trim();
    if (!texto || enviando || !id) return;
    const conCliente: Mensaje[] = [...mensajes.filter((m) => m.role !== "error"), { role: "cliente", text: texto }];
    setMensajes(conCliente);
    setEntrada("");
    setEnviando(true);
    guardar(clave, { id, mensajes: conCliente });

    let respuesta: Mensaje;
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion: id, mensaje: texto }),
      });
      const data = (await r.json().catch(() => ({}))) as { respuesta?: string; error?: string };
      respuesta = r.ok && data.respuesta
        ? { role: "agente", text: data.respuesta }
        : { role: "error", text: data.error ?? "No pude responder. Intenta otra vez." };
    } catch {
      respuesta = { role: "error", text: "Sin conexión. Revisa tu internet e intenta otra vez." };
    }

    const final = [...conCliente, respuesta];
    setMensajes(final);
    setEnviando(false);
    guardar(clave, { id, mensajes: final.filter((m) => m.role !== "error") });
  }

  function reiniciar() {
    const otra = nuevaLlave();
    setId(otra);
    setMensajes([]);
    guardar(clave, { id: otra, mensajes: [] });
  }

  const panel = (
    <section
      data-chat-agente
      aria-label={"Chat con " + negocio}
      className={
        "flex flex-col overflow-hidden border border-line bg-panel " +
        (flotante
          ? "fixed inset-x-3 bottom-3 top-16 z-50 animate-lista rounded-3xl shadow-card-hover sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[560px] sm:w-[380px]"
          : "h-[520px] rounded-2xl")
      }
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Icon name="sparkle" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-strong">{negocio}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden />
            Asistente virtual · responde al instante
          </p>
        </div>
        {!flotante && (
          <button type="button" onClick={reiniciar} className="btn-ghost btn-sm">
            Reiniciar
          </button>
        )}
        {flotante && (
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-strong"
            aria-label="Cerrar chat"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        )}
      </header>

      <div ref={lista} className="flex-1 space-y-2 overflow-y-auto bg-surface/60 px-3 py-4" aria-live="polite">
        <Burbuja role="agente" text={saludo} />
        {mensajes.map((m, i) => (
          <Burbuja key={i} role={m.role} text={m.text} />
        ))}
        {enviando && (
          <div className="flex" aria-label="Escribiendo">
            <span className="flex gap-1 rounded-2xl rounded-bl-md bg-panel px-3.5 py-3 shadow-card">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle"
                  style={{ animationDelay: d + "ms" }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-line bg-panel p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <textarea
          ref={campo}
          rows={1}
          value={entrada}
          maxLength={600}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Escribe tu mensaje"
          aria-label="Tu mensaje"
          className="input max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl py-2.5"
        />
        <button
          type="submit"
          disabled={!entrada.trim() || enviando}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-all duration-150 active:scale-90 disabled:opacity-40"
          aria-label="Enviar"
        >
          <Icon name="arrowIn" className="h-5 w-5 -rotate-90" />
        </button>
      </form>
      <p className="bg-panel pb-2 text-center text-[10px] text-subtle">Respuestas generadas con IA. Pueden tener errores.</p>
    </section>
  );

  if (!flotante) return panel;

  return (
    <>
      {abierto && panel}
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar chat" : "Abrir chat con " + negocio}
        className={
          "fixed bottom-5 right-5 z-50 h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-card-hover transition-transform duration-200 ease-resorte hover:scale-105 active:scale-95 " +
          (abierto ? "hidden sm:flex" : "flex")
        }
      >
        <Icon name={abierto ? "x" : "sparkle"} className="h-6 w-6" />
      </button>
    </>
  );
}

function Burbuja({ role, text }: Mensaje) {
  const cliente = role === "cliente";
  return (
    <div className={"flex " + (cliente ? "justify-end" : "justify-start")}>
      <p
        data-rol={role}
        className={
          "max-w-[85%] whitespace-pre-line px-3.5 py-2 text-[14px] leading-snug [overflow-wrap:anywhere] " +
          (cliente
            ? "rounded-2xl rounded-br-md bg-brand-600 text-white"
            : role === "error"
              ? "rounded-2xl rounded-bl-md border border-bad-line bg-bad-soft text-bad"
              : "rounded-2xl rounded-bl-md bg-panel text-strong shadow-card")
        }
      >
        {text}
      </p>
    </div>
  );
}
