"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeCode } from "@/lib/barcode";
import { BarcodeScanner } from "./BarcodeScanner";
import { Icon } from "./Icon";

/**
 * Boton que abre la camara para leer un codigo de barras.
 *
 * Se usa en varios sitios del inventario, asi que solo devuelve el codigo y
 * cada pantalla decide que hacer con el.
 */
export function ScanButton({
  onScan,
  label = "Escanear",
  title = "Escanear codigo",
  className = "btn-ghost btn-sm",
}: {
  onScan: (code: string) => void;
  label?: string;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const recibir = useCallback(
    (code: string) => {
      setOpen(false);
      onScan(code);
    },
    [onScan]
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} title={title}>
        <Icon name="barcode" className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <BarcodeScanner onDetect={recibir} onClose={() => setOpen(false)} title={title} />
      )}
    </>
  );
}

/**
 * Escucha la pistola lectora USB o Bluetooth.
 *
 * Esos lectores no son camaras: se comportan como un teclado que escribe el
 * codigo de golpe y manda Enter. Los reconocemos por la velocidad (un humano no
 * teclea a menos de 80 ms por tecla) y no nos metemos cuando la persona esta
 * escribiendo dentro de un campo.
 */
export function useScannerWedge(onScan: (code: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let ultimo = 0;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;

      const ahora = Date.now();
      if (ahora - ultimo > 80) buffer = "";
      ultimo = ahora;

      if (event.key === "Enter") {
        const code = normalizeCode(buffer);
        buffer = "";
        if (code.length >= 4) {
          event.preventDefault();
          onScan(code);
        }
        return;
      }

      if (event.key.length === 1) buffer += event.key;
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onScan, enabled]);
}
