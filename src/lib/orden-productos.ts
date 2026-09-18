/**
 * Orden a mano de los productos en la pantalla de Ventas, para un negocio que
 * pidio verlos en filas fijas de dos columnas (izquierda | derecha).
 *
 * Cada casilla lleva varios nombres posibles, porque el producto guardado no
 * siempre se llama igual que en la lista del dueno ("Cuero limon pic" es su
 * "Cuerito de limon"). Los productos que no estan en la lista salen despues,
 * en su orden de siempre.
 */
export type CasillaOrden = string[] | null;
export type FilaOrden = [CasillaOrden, CasillaOrden];

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Solo el negocio Chopo Snacks tiene este orden. */
export function ordenParaNegocio(nombreNegocio: string): FilaOrden[] | undefined {
  return normalizar(nombreNegocio) === "chopo snacks" ? FILAS_CHOPO_SNACKS : undefined;
}

const FILAS_CHOPO_SNACKS: FilaOrden[] = [
  [["papa natural grande"], ["papa natural mediana"]],
  [["papa baston grande", "papa baston"], ["papa picante grande"]],
  [
    ["dulce grande", "chifle de dulce grande", "chifle dulce grande"],
    ["dulce mediano", "chifle de dulce mediano", "chifle dulce mediano", "chicle de dulce mediano"],
  ],
  [
    ["chifle largo grande", "chifle de sal largo grande"],
    ["chifle largo mediano", "chifle de largo mediano", "chifle de sal largo mediano"],
  ],
  [
    ["chifle redondo grande", "chifle de sal redondo grande"],
    ["chifle redondo mediano", "chifle de sal redondo mediano"],
  ],
  [["chifle picante grande"], ["chifle picante mediano", "chicle picante mediano"]],
  [
    ["chifle limon grande", "chifle de limon grande"],
    ["chifle limon mediano", "chifle de limon mediano", "chicle de limon mediano"],
  ],
  [
    ["cuero limon pic", "cuerito de limon grande", "cuero limon grande", "cuerito limon grande"],
    [
      "cuerito de limon x12",
      "cuerito de limon x 12",
      "cuerito de limon 12",
      "cuerito limon x12",
      "cuero limon x12",
      "cuero limon x 12",
    ],
  ],
  [["remixto grande"], ["remixto mediano"]],
  [["chicharron grande", "chicharron grandes"], ["chicharron mediano"]],
  [["mixto"], ["mani x 12", "mani", "habas", "mani habas", "mani x12"]],
  [["papa por 20 unidades", "papa granel"], ["gomita", "gomitas", "gomas"]],
  [["empanada", "empanada dulce zambo"], ["bizcochuelo"]],
  [["mojicon", "mojicones"], null],
];

/**
 * Acomoda una lista en las filas dadas. Devuelve `null` en las casillas cuyo
 * producto no existe, para que el que sigue no se corra de columna. Con
 * `conHuecos` en falso (al buscar) esos huecos no se dejan.
 */
export function ordenarEnFilas<T extends { name: string }>(
  items: T[],
  filas: FilaOrden[],
  conHuecos: boolean
): (T | null)[] {
  const libres = new Map(items.map((i) => [i, normalizar(i.name)] as const));
  const tomar = (casilla: CasillaOrden): T | null => {
    if (!casilla) return null;
    const nombres = casilla.map(normalizar);
    for (const [item, nombre] of libres) {
      if (nombres.includes(nombre)) {
        libres.delete(item);
        return item;
      }
    }
    return null;
  };

  const salida: (T | null)[] = [];
  for (const [izq, der] of filas) {
    const par = [tomar(izq), tomar(der)];
    if (conHuecos) {
      // Una fila sin ninguno de los dos no deja hueco.
      if (par[0] || par[1]) salida.push(...par);
    } else {
      salida.push(...par.filter((p): p is T => p !== null));
    }
  }
  const sobrantes = [...libres.keys()];
  // Los que no estan en la lista salen aparte, empezando una fila nueva.
  if (conHuecos && salida.length % 2 === 1) salida.push(null);
  return [...salida, ...sobrantes];
}
