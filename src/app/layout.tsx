import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { COLOR_APP, NOMBRE_APP, NOMBRE_CORTO } from "@/lib/icono";
import Pestanas from "./Pestanas";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: NOMBRE_APP,
  description: "Las gasolineras más baratas cerca de ti, en un mapa. Precios oficiales del Ministerio.",
  applicationName: NOMBRE_APP,
  appleWebApp: { capable: true, title: NOMBRE_CORTO, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: COLOR_APP,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={geistSans.variable}>
      <body>
        {children}
        <footer className="pie">
          <Link href="/acerca">Acerca de · Fuentes · Privacidad</Link>
        </footer>
        <Pestanas />
      </body>
    </html>
  );
}
