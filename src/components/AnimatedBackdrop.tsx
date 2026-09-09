import { NEGOCIOS } from "@/lib/brand";

/**
 * Fondo animado de las pantallas de entrada.
 *
 * Una cuadricula que se desplaza y bloques de los colores de los cuatro
 * negocios flotando despacio. Va detras de todo y no recibe toques, asi que
 * nunca estorba al escribir.
 *
 * Es un componente de servidor a proposito: son solo divs con clases, no
 * necesita JavaScript en el navegador.
 */
const BLOQUES = [
  { top: "-6%", left: "-8%", size: "clamp(160px, 26vw, 340px)", delay: "0s", rotate: "-12deg" },
  { top: "58%", left: "4%", size: "clamp(120px, 18vw, 230px)", delay: "-4s", rotate: "8deg" },
  { top: "12%", left: "62%", size: "clamp(140px, 22vw, 300px)", delay: "-7s", rotate: "14deg" },
  { top: "66%", left: "72%", size: "clamp(110px, 16vw, 210px)", delay: "-11s", rotate: "-6deg" },
];

export function AnimatedBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="backdrop-grid absolute inset-0" />

      {BLOQUES.map((bloque, i) => {
        const negocio = NEGOCIOS[i % NEGOCIOS.length];
        return (
          <span
            key={negocio.key}
            className="backdrop-bloque absolute rounded-2xl border-2"
            style={{
              top: bloque.top,
              left: bloque.left,
              width: bloque.size,
              height: bloque.size,
              backgroundColor: negocio.color,
              borderColor: negocio.color,
              // Muy tenue: tiene que sugerir movimiento, no competir con el texto.
              opacity: 0.07,
              animationDelay: bloque.delay,
              rotate: bloque.rotate,
            }}
          />
        );
      })}
    </div>
  );
}
