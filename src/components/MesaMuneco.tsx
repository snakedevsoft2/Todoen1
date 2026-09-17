"use client";

/**
 * Una mesa de madera dibujada desde arriba, con sus sillas de colores. Para
 * que el piso del restaurante se vea como un restaurante y no como una lista
 * de renglones: una mesa vacía tiene sillas vacías, una mesa con gente tiene
 * muñecos sentados en sillas de colores, y una con un pedido nuevo del
 * cliente se nota de lejos (parpadea en rojo).
 */
export type EstadoMesa = "libre" | "ocupada" | "nueva";

const AVISO: Record<EstadoMesa, { anillo: string; brillo: string }> = {
  libre: { anillo: "#00000014", brillo: "transparent" },
  ocupada: { anillo: "#d97706", brillo: "#fbbf2433" },
  nueva: { anillo: "#dc2626", brillo: "#ef444455" },
};

/** Los colores de las sillas, en el mismo orden que en las fotos de mesas de verdad: nunca hacen juego, y por eso se ven vivas. */
const COLOR_SILLA = ["#dc2626", "#2563eb", "#059669", "#d97706"];

/** Un muñequito sentado: cabeza redonda y un cuerpo en forma de arco, del color de su silla. */
function Persona({ color }: { color: string }) {
  return (
    <g>
      <circle r="5.5" cy="-3" fill="#3f2a1a" />
      <path d="M -6 9 A 6 8 0 0 1 6 9 Z" fill={color} />
    </g>
  );
}

/** Una silla vista desde arriba: el respaldo curvo, del color que le toco. */
function Silla({ x, y, angulo, color, vacia }: { x: number; y: number; angulo: number; color: string; vacia: boolean }) {
  return (
    <g transform={"translate(" + x + "," + y + ") rotate(" + angulo + ")"}>
      <rect x="-9" y="-5" width="18" height="12" rx="5" fill={vacia ? "#d6d3d1" : color} opacity={vacia ? 0.7 : 1} />
      {!vacia && (
        <g transform="translate(0,-2)">
          <Persona color={color} />
        </g>
      )}
    </g>
  );
}

/**
 * Vista de una mesa redonda con hasta 4 sillas, sobre tablero de madera.
 * `ocupadas` dice cuantas sillas tienen gente sentada (aproximado por los
 * items del pedido, no una cuenta exacta de personas).
 */
export function MesaMuneco({
  numero,
  estado,
  ocupadas = 0,
  size = 100,
}: {
  numero: number;
  estado: EstadoMesa;
  /** De 0 a 4: cuantas sillas se pintan con gente. */
  ocupadas?: number;
  size?: number;
}) {
  const aviso = AVISO[estado];
  const asientos = Math.max(0, Math.min(4, estado === "libre" ? 0 : ocupadas || 2));
  const sillas = [
    { x: 50, y: 8, angulo: 0 },
    { x: 50, y: 92, angulo: 180 },
    { x: 8, y: 50, angulo: -90 },
    { x: 92, y: 50, angulo: 90 },
  ];
  const id = "madera-" + numero;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="35%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#deae7e" />
          <stop offset="65%" stopColor="#c68a52" />
          <stop offset="100%" stopColor="#a06a37" />
        </radialGradient>
      </defs>
      {aviso.brillo !== "transparent" && <circle cx="50" cy="50" r="46" fill={aviso.brillo} />}
      {sillas.map((p, i) => (
        <Silla key={i} x={p.x} y={p.y} angulo={p.angulo} color={COLOR_SILLA[i]} vacia={i >= asientos} />
      ))}
      <circle cx="50" cy="50" r="30" fill={"url(#" + id + ")"} stroke={aviso.anillo} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="#00000014" strokeWidth="1" />
      <text x="50" y="56" textAnchor="middle" fontSize="18" fontWeight="800" fill="#ffffffdd" stroke="#6b431f" strokeWidth="0.6">
        {numero}
      </text>
    </svg>
  );
}

/** Una matica decorativa, solo para que el piso se vea vivo. Nada mas. */
export function MacetaDecorativa({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <path d="M13 40 10 26h20l-3 14Z" fill="#a3652f" />
      <ellipse cx="20" cy="26" rx="10" ry="2.2" fill="#8a5426" />
      <g fill="#2f7d3a">
        <ellipse cx="20" cy="16" rx="11" ry="9" />
        <ellipse cx="12" cy="20" rx="7" ry="6" />
        <ellipse cx="28" cy="20" rx="7" ry="6" />
      </g>
      <g fill="#3f9a4d">
        <ellipse cx="17" cy="13" rx="5" ry="4" />
        <ellipse cx="25" cy="15" rx="4.5" ry="3.5" />
      </g>
    </svg>
  );
}
