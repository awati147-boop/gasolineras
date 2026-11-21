"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/", icono: "⛽", nombre: "Gasolina" },
  { href: "/aparcar", icono: "🅿️", nombre: "Aparcar" },
  { href: "/me-voy", icono: "🚗", nombre: "Me voy" },
];

/** Barra de navegación inferior (estilo app) */
export default function Pestanas() {
  const ruta = usePathname();
  return (
    <nav className="pestanas" aria-label="Secciones">
      {PESTANAS.map((p) => {
        const activa = p.href === "/" ? ruta === "/" : ruta.startsWith(p.href);
        return (
          <Link key={p.href} href={p.href} className={activa ? "pestana activa" : "pestana"} aria-current={activa ? "page" : undefined}>
            <span className="pestana-icono" aria-hidden>{p.icono}</span>
            <span>{p.nombre}</span>
          </Link>
        );
      })}
    </nav>
  );
}
