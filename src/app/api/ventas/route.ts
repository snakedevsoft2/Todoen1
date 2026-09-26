import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { registrarVenta } from "@/lib/ventas";

/**
 * Registra una venta que llega del telefono: al momento, o mas tarde desde la
 * cola si se hizo sin senal. Con la misma llave responde la misma venta.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 300_000) {
    return Response.json({ error: "La venta es demasiado larga." }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Venta inválida." }, { status: 400 });
  }

  const r = await registrarVenta(sesion, cuerpo ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  if (!r.datos.repetido) {
    revalidatePath("/panel/ventas");
    revalidatePath("/panel/inventario");
    revalidatePath("/panel/caja");
    revalidatePath("/panel/cartera");
    revalidatePath("/panel/clientes");
    revalidatePath("/panel");
  }
  // `receiptSeq` tiene que ir: es el numero de recibo del negocio (0001, 0002...)
  // y el telefono lo imprime apenas termina la venta. Sin el, el recibo caia al
  // respaldo -las ultimas ocho letras del id, "AZEDNXWZ"- y el numero bonito
  // solo se veia en la lista de Ventas. Ver numeroDe() en lib/invoice.ts.
  return Response.json({
    id: r.datos.id,
    repetido: r.datos.repetido,
    tipo: r.datos.tipo,
    receiptSeq: r.datos.receiptSeq,
  });
}
