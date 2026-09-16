"use client";

/**
 * Una mesa dibujada desde arriba, con sus sillas. Para que el piso del
 * restaurante se vea como un restaurante y no como una lista de renglones:
 * una mesa vacía tiene sillas vacías, una mesa con gente tiene muñecos
 * sentados, y una con un pedido nuevo del cliente se nota de lejos.
 */
export type EstadoMesa = "libre" | "ocupada" | "nueva";

const COLOR: Record<EstadoMesa, { mesa: string; silla: string; gente: string }> = {
  libre: { mesa: "#e2e8f0", silla: "#cbd5e1", gente: "#cbd5e1" },
  ocupada: { mesa: "#fde68a", silla: "#d97706", gente: "#92400e" },
  nueva: { mesa: "#fecaca", silla: "#dc2626", gente: "#b91c1c" },
};

/** Un muñequito sentado: cabeza redonda y un cuerpo en forma de arco. */
function Persona({ x, y, color, sentado }: { x: number; y: number; color: string; sentado: boolean }) {
  if (!sentado) return null;
  return (
    <g transform={"translate(" + x + "," + y + ")"}>
      <circle r="6.5" cy="-2" fill={color} />
      <path d="M -7 12 A 7 9 0 0 1 7 12 Z" fill={color} />
    </g>
  );
}

/**
 * Vista de una mesa redonda con hasta 4 sillas. `ocupadas` dice cuantas
 * sillas tienen gente sentada (aproximado por los items del pedido, no una
 * cuenta exacta de personas).
 */
export function MesaMuneco({
  numero,
  estado,
  ocupadas = 0,
  size = 92,
}: {
  numero: number;
  estado: EstadoMesa;
  /** De 0 a 4: cuantas sillas se pintan con gente. */
  ocupadas?: number;
  size?: number;
}) {
  const c = COLOR[estado];
  const asientos = Math.max(0, Math.min(4, estado === "libre" ? 0 : ocupadas || 2));
  const sillas = [
    { x: 46, y: 6 },
    { x: 46, y: 86 },
    { x: 6, y: 46 },
    { x: 86, y: 46 },
  ];

  return (
    <svg viewBox="0 0 92 92" width={size} height={size} aria-hidden="true">
      {sillas.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="9" fill={i < asientos ? "transparent" : c.silla} opacity={i < asientos ? 0 : 0.6} />
      ))}
      <circle cx="46" cy="46" r="30" fill={c.mesa} stroke="#00000014" strokeWidth="1.5" />
      <text x="46" y="51" textAnchor="middle" fontSize="16" fontWeight="700" fill="#00000066">
        {numero}
      </text>
      {sillas.map((p, i) => (
        <Persona key={i} x={p.x} y={p.y} color={c.gente} sentado={i < asientos} />
      ))}
    </svg>
  );
}
