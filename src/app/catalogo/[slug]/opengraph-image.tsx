import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { APP_NAME } from "@/lib/brand";

/**
 * La miniatura que sale al pegar el enlace del portafolio en WhatsApp.
 *
 * Sin esto, el enlace llegaba como texto pelado: nadie toca un enlace que no
 * muestra nada. Con esto llega una tarjeta con la portada, el logo y el nombre
 * del negocio, que es lo que hace que el cliente lo abra.
 *
 * Se genera en el servidor y no se sube a mano, para que cambie sola cuando el
 * negocio cambia su portada o su nombre.
 *
 * Una limitacion que manda sobre el diseno: el generador de imagenes solo lee
 * PNG y JPEG, y las fotos que se achican en el telefono a veces quedan en WebP.
 * Una portada en WebP no se puede poner de fondo; ahi la tarjeta sale con el
 * color del negocio, que tambien se ve bien. Es mejor eso que una miniatura rota.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Portafolio del negocio";

/** Solo lo que el generador sabe pintar. */
function usable(dataUrl: string | null | undefined): string | null {
  return dataUrl && /^data:image\/(png|jpeg|jpg);base64,/.test(dataUrl) ? dataUrl : null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await Promise.resolve(params);

  const shop = await db.user
    .findUnique({
      where: { slug },
      select: {
        businessName: true,
        publicHeadline: true,
        tagline: true,
        brandColor: true,
        logo: true,
        publicCover: true,
        suspendedAt: true,
      },
    })
    .catch(() => null);

  // Enlace de un negocio que no existe o esta suspendido: tarjeta de la
  // plataforma, sin decir nada del negocio.
  if (!shop || shop.suspendedAt) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111116",
            color: "#fff",
            fontSize: 84,
            fontWeight: 700,
          }}
        >
          {APP_NAME}
        </div>
      ),
      size
    );
  }

  const portada = usable(shop.publicCover);
  const logo = usable(shop.logo);
  const color = /^#[0-9a-f]{6}$/i.test(shop.brandColor) ? shop.brandColor : "#5856d6";
  const subtitulo = shop.publicHeadline || shop.tagline || "Mira el catálogo y pide por WhatsApp";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: color }}>
        {portada && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portada}
            alt=""
            width={1200}
            height={630}
            style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }}
          />
        )}

        {/* Una capa oscura: el color de marca lo elige el negocio y puede ser
            claro, y encima de una foto el texto blanco no siempre se lee. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: portada ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.16)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            width: "100%",
            height: "100%",
            padding: "64px 72px",
            color: "#fff",
          }}
        >
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              width={120}
              height={120}
              style={{
                width: 120,
                height: 120,
                borderRadius: 28,
                objectFit: "contain",
                background: "#fff",
                padding: 10,
                marginBottom: 32,
              }}
            />
          )}

          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5, display: "flex" }}>
            {shop.businessName.slice(0, 40)}
          </div>
          <div style={{ fontSize: 34, marginTop: 16, opacity: 0.92, display: "flex" }}>
            {subtitulo.slice(0, 70)}
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
            <div
              style={{
                display: "flex",
                background: "#fff",
                color: "#111116",
                fontSize: 28,
                fontWeight: 700,
                padding: "14px 28px",
                borderRadius: 999,
              }}
            >
              Ver catálogo
            </div>
            <div style={{ display: "flex", fontSize: 24, marginLeft: 24, opacity: 0.8 }}>{APP_NAME}</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
