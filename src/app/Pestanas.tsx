"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoCoche, IconoParking, IconoSurtidor } from "./Iconos";

/** Barra de navegación inferior. "Me voy" va en el centro y destacado: es la acción que alimenta la comunidad. */
export default function Pestanas() {
  const ruta = usePathname();
  const activa = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));

  return (
    <nav className="pestanas" aria-label="Secciones">
      <Link href="/" className={activa("/") ? "pestana activa" : "pestana"} aria-current={activa("/") ? "page" : undefined}>
        <IconoSurtidor />
        <span>Gasolina</span>
      </Link>
      <Link
        href="/me-voy"
        className={activa("/me-voy") ? "pestana central activa" : "pestana central"}
        aria-current={activa("/me-voy") ? "page" : undefined}
      >
        <span className="central-boton"><IconoCoche tam={26} /></span>
        <span>Me voy</span>
      </Link>
      <Link
        href="/aparcar"
        className={activa("/aparcar") ? "pestana activa" : "pestana"}
        aria-current={activa("/aparcar") ? "page" : undefined}
      >
        <IconoParking />
        <span>Aparcar</span>
      </Link>
    </nav>
  );
}
