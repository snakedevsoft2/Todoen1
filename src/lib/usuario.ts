/**
 * El usuario con el que entra un empleado.
 *
 * El dueño se lo pone al agregarlo y el empleado entra escribiendo solo ese
 * usuario, sin contraseña. Por eso no lleva arroba (asi el ingreso sabe que no
 * es un correo) y se guarda sin tildes ni mayusculas: "Julián" y "julian" son
 * el mismo, porque nadie recuerda como lo escribio.
 *
 * No usa la base de datos: lo importa tambien el navegador.
 */

export const USUARIO_VALIDO = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export const USUARIO_INVALIDO =
  "El usuario va sin espacios, tildes ni arroba: de 3 a 30 letras, números, punto, guion o guion bajo.";

export function normalizarUsuario(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
}

/** Lo que se escribe en el ingreso: sin arroba es un usuario, con arroba un correo. */
export function esUsuario(valor: string): boolean {
  const v = valor.trim();
  return v !== "" && !v.includes("@");
}
