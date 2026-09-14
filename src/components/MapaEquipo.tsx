"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export type PersonaMapa = {
  id: string;
  nombre: string;
  color: string;
  /** Donde se le vio por ultima vez hoy. */
  ultima: { lat: number; lng: number; hora: string } | null;
  /** El recorrido del dia, en orden. */
  recorrido: [number, number][];
  visitas: { lat: number; lng: number; texto: string }[];
};

/**
 * El mapa del equipo: la ultima ubicacion de cada persona, su recorrido del
 * dia y las llegadas que marco.
 *
 * Usa Leaflet con los mapas de OpenStreetMap: no necesita llave ni cuenta.
 * Se carga solo en el navegador, porque Leaflet toca la ventana al importarse.
 */
export function MapaEquipo({ personas }: { personas: PersonaMapa[] }) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    let mapa: import("leaflet").Map | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !caja.current) return;
      mapa = L.map(caja.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);

      const puntos: [number, number][] = [];
      for (const p of personas) {
        if (p.recorrido.length > 1) {
          L.polyline(p.recorrido, { color: p.color, weight: 3, opacity: 0.55 }).addTo(mapa);
        }
        puntos.push(...p.recorrido);
        for (const v of p.visitas) {
          L.circleMarker([v.lat, v.lng], { radius: 6, color: p.color, weight: 3, fillColor: "#ffffff", fillOpacity: 1 })
            .bindTooltip(v.texto)
            .addTo(mapa);
          puntos.push([v.lat, v.lng]);
        }
        if (p.ultima) {
          // Circulos y no el alfiler de Leaflet: el alfiler es una imagen que
          // el empaquetador no encuentra y sale roto.
          L.circleMarker([p.ultima.lat, p.ultima.lng], { radius: 9, color: "#ffffff", weight: 2, fillColor: p.color, fillOpacity: 1 })
            .bindTooltip(p.nombre + " · " + p.ultima.hora, { permanent: true, direction: "top", offset: [0, -10] })
            .addTo(mapa);
          puntos.push([p.ultima.lat, p.ultima.lng]);
        }
      }
      if (puntos.length > 0) mapa.fitBounds(L.latLngBounds(puntos).pad(0.25), { maxZoom: 16 });
      else mapa.setView([4.65, -74.08], 11);
    })();
    return () => {
      vivo = false;
      mapa?.remove();
    };
  }, [personas]);

  // isolate: el mapa arma sus propias capas y sin esto se pondria encima del
  // menu de abajo del celular.
  return <div ref={caja} data-mapa-equipo className="isolate h-72 w-full overflow-hidden rounded-xl border border-line sm:h-96" />;
}
