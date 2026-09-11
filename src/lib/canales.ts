/**
 * Canales oficiales de la aplicacion.
 *
 * Ojo con la diferencia: esto es de quien hace Todoen1, no del negocio que la
 * usa. Los canales del negocio (su WhatsApp, su catalogo) se configuran en el
 * panel y no tienen nada que ver con estos.
 *
 * Estan en un solo archivo por lo mismo que el numero de soporte: el dia que
 * cambie un enlace no hay que salir a buscarlo por todas las pantallas.
 */

import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_PRETTY } from "./support";

export type Canal = {
  key: string;
  /** Como se llama el canal. */
  label: string;
  /** El usuario o el numero, para que se vea a donde va antes de tocar. */
  handle: string;
  url: string;
  /** Logo del canal, servido desde /public. */
  logo: string;
};

export const CANALES: Canal[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    handle: SUPPORT_WHATSAPP_PRETTY,
    // Sin mensaje escrito a proposito: aqui todavia no sabemos quien escribe
    // ni desde que negocio. Ese enlace con contexto lo arma supportLink().
    url: "https://wa.me/" + SUPPORT_WHATSAPP,
    logo: "/LOGO/wpp.png",
  },
  {
    key: "instagram",
    label: "Instagram",
    handle: "@snakedev.software",
    url: "https://www.instagram.com/snakedev.software/",
    logo: "/LOGO/instagram.png",
  },
  {
    key: "facebook",
    label: "Facebook",
    // El enlace es por id numerico, asi que no hay nombre de usuario que
    // mostrar. Si algun dia le ponen nombre a la pagina, va aqui.
    handle: "Nuestro perfil",
    url: "https://www.facebook.com/profile.php?id=61593178813082",
    logo: "/LOGO/facebook.png",
  },
];
