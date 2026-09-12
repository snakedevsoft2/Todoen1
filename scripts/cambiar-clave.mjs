/**
 * Le pone una contrasena nueva a una cuenta, desde la terminal.
 *
 * El camino normal para el que olvido la suya es la propia aplicacion:
 * "Olvidaste tu contrasena?" en la pantalla de ingreso le manda un enlace al
 * correo. Esto es la salida de atras, para cuando ese camino no esta: sin
 * RESEND_API_KEY configurada, o cuando la cuenta quedo trancada por algo mas.
 *
 * En los dos casos la clave que estaba guardada no se puede recuperar, porque
 * en la base solo vive su hash de bcrypt, que va en un solo sentido a
 * proposito. Aqui tampoco se lee la vieja: se reemplaza.
 *
 * Uso:
 *   node scripts/cambiar-clave.mjs correo@ejemplo.com "la-clave-nueva"
 *
 * Necesita la base prendida (npm run db:up) y DATABASE_URL en .env.
 *
 * Sirve tanto para la cuenta del negocio (User) como para el usuario de un
 * empleado o barbero (Staff): busca primero el negocio, que es lo normal.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const [, , correoBruto, claveNueva] = process.argv;

if (!correoBruto || !claveNueva) {
  console.error("Uso: node scripts/cambiar-clave.mjs <correo> <clave-nueva>");
  process.exit(1);
}

// Los mismos minimos que pide la pantalla de Ajustes: de nada sirve poner por
// la terminal una clave que la app despues no dejaria escribir.
if (claveNueva.length < 6) {
  console.error("La contrasena nueva debe tener al menos 6 caracteres.");
  process.exit(1);
}

const correo = correoBruto.trim().toLowerCase();
const db = new PrismaClient();

try {
  // El mismo costo que usa la app (src/lib/auth.ts), o el hash no serviria.
  const passwordHash = bcrypt.hashSync(claveNueva, 10);

  const negocio = await db.user.findUnique({
    where: { email: correo },
    select: { id: true, businessName: true, ownerName: true },
  });

  if (negocio) {
    await db.user.update({ where: { id: negocio.id }, data: { passwordHash } });
    console.log("Listo. Contrasena cambiada.");
    console.log("  Cuenta:  " + correo + "  (" + negocio.businessName + ")");
    console.log("  Entra en /login con la clave nueva.");
  } else {
    const persona = await db.staff.findFirst({
      where: { email: correo },
      select: { id: true, name: true, role: true },
    });

    if (!persona) {
      console.error("No hay ninguna cuenta con el correo " + correo + ".");
      console.error("Revisa que sea el mismo con el que te registraste.");
      process.exitCode = 1;
    } else {
      await db.staff.update({ where: { id: persona.id }, data: { passwordHash } });
      console.log("Listo. Contrasena cambiada.");
      console.log("  Usuario: " + correo + "  (" + persona.name + ", " + persona.role + ")");
      console.log("  Entra en /login con la clave nueva.");
    }
  }
} catch (error) {
  console.error("No se pudo cambiar la contrasena.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
