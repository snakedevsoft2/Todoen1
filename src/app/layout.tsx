import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Black } from "next/font/google";
import "./globals.css";

/**
 * Tipografia propia.
 *
 * Next descarga y sirve las fuentes desde el mismo dominio, asi que no hay
 * peticion a Google en produccion ni parpadeo al cargar.
 *
 * Archivo para todo el texto y Archivo Black para los titulos y la plata: son
 * la misma familia, asi que combinan solas, y la negra es bien cuadrada, que es
 * justo el caracter que buscamos.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo-black",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Todoen1 - Ventas, inventario y caja",
  description:
    "Aplicacion para barberias, restaurantes, comidas rapidas y tiendas de ropa: turnos, inventario, ventas del dia, gastos y cierre de caja.",
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${archivo.variable} ${archivoBlack.variable}`}>
      <body>{children}</body>
    </html>
  );
}
