"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { buscarPreguntaAction, responderPreguntaAction } from "@/actions/seguridad";
import { SUPPORT_WHATSAPP } from "@/lib/support";
import { Icon } from "./Icon";

function Boton({ texto, cargando }: { texto: string; cargando: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-btn-primary" disabled={pending}>
      {pending ? cargando : texto}
    </button>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div
      role="alert"
      className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-rose-700"
    >
      <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}

/**
 * Recuperar la clave respondiendo la pregunta de seguridad.
 *
 * Dos pasos: el correo, y despues la pregunta con la clave nueva. Un correo
 * que no existe tambien recibe una pregunta; nada en esta pantalla dice cual
 * correo tiene cuenta.
 */
export function RecuperarConPreguntaForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [paso1, buscar] = useActionState(buscarPreguntaAction, undefined);
  const [paso2, responder] = useActionState(responderPreguntaAction, undefined);
  const [email, setEmail] = useState(defaultEmail);

  const ayuda =
    "https://wa.me/" +
    SUPPORT_WHATSAPP +
    "?text=" +
    encodeURIComponent("Hola, no puedo entrar a Todoen1." + (email ? " Mi correo es: " + email : ""));

  return (
    <div className="w-full">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
        Responde tu pregunta
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
        Si configuraste una pregunta de seguridad en Ajustes, con ella pones una contraseña nueva sin
        esperar ningún correo.
      </p>

      {!paso1?.pregunta ? (
        <>
          {paso1?.error && <Aviso texto={paso1.error} />}
          <form action={buscar} className="mt-6 space-y-5">
            <div>
              <label htmlFor="email" className="auth-label">
                Correo electrónico
              </label>
              <input
                id="email"
                className="auth-input"
                type="email"
                name="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
            <Boton texto="Ver mi pregunta" cargando="Buscando..." />
          </form>
        </>
      ) : (
        <>
          {paso2?.error && <Aviso texto={paso2.error} />}
          <form action={responder} className="mt-6 space-y-5">
            <input type="hidden" name="email" value={paso1.email} />

            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[12px] text-slate-500">{paso1.email}</p>
              <p className="mt-1 text-[15px] font-semibold text-slate-900">{paso1.pregunta}</p>
            </div>

            <div>
              <label htmlFor="respuesta" className="auth-label">
                Tu respuesta
              </label>
              <input
                id="respuesta"
                className="auth-input"
                name="respuesta"
                required
                autoFocus
                autoComplete="off"
                placeholder="No importan tildes ni mayúsculas"
              />
            </div>
            <div>
              <label htmlFor="password" className="auth-label">
                Contraseña nueva
              </label>
              <input
                id="password"
                className="auth-input"
                type="password"
                name="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Al menos 6 caracteres"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="auth-label">
                Repite la contraseña
              </label>
              <input
                id="confirmPassword"
                className="auth-input"
                type="password"
                name="confirmPassword"
                required
                autoComplete="new-password"
              />
            </div>
            <Boton texto="Cambiar contraseña" cargando="Comprobando..." />
          </form>
        </>
      )}

      <div className="mt-6 rounded-[10px] border border-slate-200 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
        ¿Nunca configuraste una pregunta? Esta opción no te sirve: prueba{" "}
        <Link href="/recuperar" className="auth-link">
          con el enlace por correo
        </Link>{" "}
        o{" "}
        <a href={ayuda} target="_blank" rel="noopener noreferrer" className="auth-link">
          escríbenos por WhatsApp
        </a>
        .
      </div>

      <p className="mt-8 text-center text-[14px] text-slate-500">
        ¿Ya te acordaste?{" "}
        <Link href="/login" className="auth-link">
          Volver a ingresar
        </Link>
      </p>
    </div>
  );
}
