import { isTheme, normalizeHex, themeCss, type ThemeName } from "@/lib/theme";

/**
 * Pinta la aplicacion con los colores del negocio.
 *
 * Escribe las variables CSS del tema en la propia pagina, asi que el color de
 * marca y el tema claro u oscuro llegan ya aplicados en el primer render, sin
 * parpadeo.
 */
export function ThemeStyle({
  brandColor,
  theme,
}: {
  brandColor: string | null | undefined;
  theme: string | null | undefined;
}) {
  const safeTheme: ThemeName = isTheme(theme) ? theme : "claro";
  const css = themeCss(normalizeHex(brandColor), safeTheme);
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
