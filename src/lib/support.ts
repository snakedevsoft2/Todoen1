/**
 * Canal de soporte tecnico.
 *
 * Un solo sitio con el numero, para no tenerlo regado por la aplicacion.
 */

/** Numero de WhatsApp de soporte, solo digitos con indicativo de pais. */
export const SUPPORT_WHATSAPP = "573148820056";

/** Como se muestra en pantalla. */
export const SUPPORT_WHATSAPP_PRETTY = "+57 314 882 0056";

export const SUPPORT_HOURS = "Lunes a sabado, 8:00 am a 8:00 pm";

/**
 * Enlace de WhatsApp con el mensaje ya escrito.
 *
 * Va con el nombre y el tipo de negocio para que quien atiende sepa de una
 * quien escribe y desde donde, sin tener que preguntarlo.
 */
export function supportLink({
  businessName,
  businessLabel,
  personName,
  topic,
}: {
  businessName: string;
  businessLabel: string;
  personName?: string;
  /** De que trata: se agrega al final del mensaje. */
  topic?: string;
}): string {
  const lines = [
    "Hola, necesito ayuda con TODO EN UNO.",
    "",
    "Negocio: " + businessName + " (" + businessLabel + ")",
  ];
  if (personName) lines.push("Soy: " + personName);
  if (topic) lines.push("", "Tema: " + topic);
  lines.push("", "Lo que me pasa es:");

  return "https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent(lines.join("\n"));
}

/** Motivos frecuentes, para que la persona no tenga que redactar de cero. */
export const SUPPORT_TOPICS: { label: string; hint: string; icon: string }[] = [
  {
    label: "No me cuadra la caja",
    hint: "Diferencias entre lo contado y lo registrado",
    icon: "lock",
  },
  {
    label: "Problema con el inventario",
    hint: "Stock que no cuadra, tallas o codigos de barras",
    icon: "box",
  },
  {
    label: "No puedo entrar",
    hint: "Contrasena, correo o acceso de un empleado",
    icon: "user",
  },
  {
    label: "Quiero aprender a usar algo",
    hint: "Te explicamos la parte que necesites",
    icon: "check",
  },
  {
    label: "Se ve mal o esta lento",
    hint: "Fallas en el celular o en el computador",
    icon: "alert",
  },
  {
    label: "Otra cosa",
    hint: "Cuentanos y te respondemos",
    icon: "whatsapp",
  },
];
