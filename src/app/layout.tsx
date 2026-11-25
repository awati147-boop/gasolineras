import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { COLOR_APP, NOMBRE_APP, NOMBRE_CORTO } from "@/lib/app";
import Pestanas from "./Pestanas";
import AvisoInstalar from "./AvisoInstalar";
import { IconoInfo, IconoPersona, Logo } from "./Iconos";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: NOMBRE_APP, template: `%s · ${NOMBRE_APP}` },
  description: "Gasolineras más baratas, plazas libres y aparcamiento cerca de ti. Gratis y sin registro.",
  applicationName: NOMBRE_APP,
  appleWebApp: { capable: true, title: NOMBRE_CORTO, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: COLOR_APP,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={geistSans.variable}>
      <body>
        <header className="cabecera">
          <Link href="/" className="cabecera-marca">
            <Logo />
            <span>{NOMBRE_APP}</span>
          </Link>
          <nav className="cabecera-acciones">
          <Link href="/cuenta" className="cabecera-info" aria-label="Mi cuenta">
            <IconoPersona />
          </Link>
          <Link href="/acerca" className="cabecera-info" aria-label="Acerca de, fuentes y privacidad">
            <IconoInfo />
          </Link>
          </nav>
        </header>
        {children}
        <footer className="pie">
          <Link href="/acerca">Acerca de</Link> · <Link href="/condiciones">Condiciones</Link> ·{" "}
          <Link href="/privacidad">Privacidad</Link> · <Link href="/cookies">Cookies</Link> ·{" "}
          <Link href="/aviso-legal">Aviso legal</Link>
        </footer>
        <AvisoInstalar />
        <Pestanas />
      </body>
    </html>
  );
}
