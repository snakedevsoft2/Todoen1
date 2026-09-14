"use client";

import { useEffect, useState } from "react";

/**
 * Cuando algo del panel falla, en vez de la pantalla en blanco.
 *
 * El caso comun es tocar un boton que necesita internet (borrar una venta,
 * cambiar el pago) estando sin senal: se explica eso y se deja reintentar.
 */
export default function ErrorDelPanel({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [sinSenal, setSinSenal] = useState(false);
  useEffect(() => setSinSenal(!navigator.onLine), []);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold text-strong">{sinSenal ? "Esto necesita señal" : "Algo no salió bien"}</h1>
      <p className="mt-2 text-sm text-muted">
        {sinSenal
          ? "Estás sin conexión y esta acción necesita internet. Las ventas, los marcajes, los reportes y los documentos escaneados sí se guardan en el teléfono y se suben solos."
          : "No se pudo completar. Vuelve a intentarlo en un momento."}
      </p>
      <button type="button" className="btn-primary mt-5" onClick={() => reset()}>
        Reintentar
      </button>
    </div>
  );
}
