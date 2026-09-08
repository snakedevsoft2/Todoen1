import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TODO EN UNO - Ventas, turnos y caja",
  description:
    "Aplicacion para barberias, restaurantes y comidas rapidas: turnos, ventas del dia, gastos y cierre de caja.",
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
