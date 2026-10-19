"use client";

import { useEffect } from "react";
import { recargarSiEsVersion, reportarError } from "@/lib/error-cliente";

/**
 * Lo que se ve cuando algo se cae por fuera de las pantallas del panel (en el
 * layout, en el menu, en la cola sin senal) y panel/error.tsx no alcanza a
 * atraparlo.
 *
 * Sin este archivo salia la pantalla blanca de Next, en ingles y sin ningun
 * boton: "Application error: a client-side exception has occurred". En la
 * aplicacion instalada del iPhone no hay barra para recargar, asi que la
 * persona quedaba atrapada hasta cerrar la aplicacion a mano. Le paso a Fer.
 *
 * Reemplaza todo el documento, por eso trae su propio html y sus estilos
 * escritos aqui: los de la aplicacion pueden no estar cargados.
 */
export default function ErrorGeneral({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportarError(error, "global");
    // Una version vieja abierta despues de publicar una nueva: se arregla sola.
    recargarSiEsVersion(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
          background: "#f7f7fa",
          color: "#111116",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>La aplicación se trabó</h1>
          <p style={{ color: "#6e6e78", fontSize: 15, lineHeight: 1.5, margin: "0 0 24px" }}>
            Toca el botón para volver a abrirla. Lo que tengas guardado en el teléfono sin señal no se pierde.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: "block",
              width: "100%",
              padding: 14,
              borderRadius: 14,
              fontSize: 16,
              fontWeight: 600,
              border: 0,
              background: "#5856d6",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Volver a abrir
          </button>
        </div>
      </body>
    </html>
  );
}
