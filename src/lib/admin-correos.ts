/**
 * Quien administra la plataforma.
 *
 * Va en una variable de entorno y no en una columna de la base a proposito:
 * asi no hay ninguna pantalla, ninguna accion y ninguna consulta que pueda
 * volver administrador a nadie. Para dar ese poder hay que entrar al servidor
 * y cambiar la configuracion, que es justo lo que queremos.
 *
 * Se escriben separados por coma:
 *   ADMIN_EMAILS="tucorreo@gmail.com,socio@gmail.com"
 *
 * Si la variable esta vacia, no hay administrador y el panel no existe para
 * nadie. Esa es la posicion segura: sin configurar, nadie entra.
 *
 * Esta aparte de lib/admin.ts porque el control de pagos y el plan tambien lo
 * miran, y admin.ts depende de auth.ts, que a su vez depende de pagos.ts.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

export function hayAdmin(): boolean {
  return adminEmails().length > 0;
}

/** Si el correo con el que entro esta en la lista. */
export function esAdmin(correo: string | null | undefined): boolean {
  if (!correo) return false;
  return adminEmails().includes(correo.trim().toLowerCase());
}
