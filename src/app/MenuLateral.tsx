"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NOMBRE_APP } from "@/lib/app";
import { Logo } from "./Iconos";

type Enlace = { href: string; texto: string; icono: string };

const SECCIONES: { titulo?: string; enlaces: Enlace[] }[] = [
  {
    enlaces: [
      { href: "/", texto: "Gasolina", icono: "⛽" },
      { href: "/me-voy", texto: "Me voy (dejo mi plaza)", icono: "🚗" },
      { href: "/aparcar", texto: "Aparcar", icono: "🅿️" },
    ],
  },
  {
    titulo: "Garajes",
    enlaces: [
      { href: "/aparcar?ver=garajes", texto: "Buscar un garaje", icono: "🔍" },
      { href: "/alquila-tu-garaje", texto: "Gana dinero con tu garaje", icono: "💶" },
      { href: "/cuenta/publicar", texto: "Publicar mi garaje", icono: "➕" },
      { href: "/cuenta#reservas", texto: "Mis reservas", icono: "📋" },
      { href: "/cuenta#garajes", texto: "Mis garajes", icono: "🏠" },
    ],
  },
  {
    titulo: "Cuenta",
    enlaces: [
      { href: "/cuenta", texto: "Mi cuenta", icono: "👤" },
      { href: "/cuenta#avisos", texto: "Avisos", icono: "🔔" },
    ],
  },
  {
    titulo: "Más",
    enlaces: [
      { href: "/acerca#instalar", texto: "Instalar la app", icono: "📲" },
      { href: "/acerca", texto: "Acerca de y fuentes", icono: "ℹ️" },
    ],
  },
];

const LEGAL = [
  { href: "/privacidad", texto: "Privacidad" },
  { href: "/condiciones", texto: "Condiciones" },
  { href: "/cookies", texto: "Cookies" },
  { href: "/aviso-legal", texto: "Aviso legal" },
];

/** Botón ☰ de la cabecera y menú lateral con accesos directos.
 *  El menú va en <body> (portal): dentro de la cabecera quedaría por debajo de la barra de pestañas,
 *  porque el desenfoque de la cabecera crea su propia capa. */
export default function MenuLateral() {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();
  // En el servidor no hay document: el menú se monta en <body> solo en el navegador
  const enNavegador = useSyncExternalStore(() => () => {}, () => true, () => false);

  // Escape cierra; con el menú abierto la página de fondo no se desplaza
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alPulsar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = antes;
    };
  }, [abierto]);

  const cerrar = () => setAbierto(false);
  const actual = (href: string) => (href === "/" ? ruta === "/" : !href.includes("?") && !href.includes("#") && ruta === href);

  return (
    <>
      <button
        type="button"
        className="cabecera-info"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        aria-expanded={abierto}
        aria-controls="menu-lateral"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {enNavegador && createPortal(<>
      <div className={abierto ? "menu-fondo visible" : "menu-fondo"} onClick={cerrar} aria-hidden />
      <aside
        id="menu-lateral"
        className={abierto ? "menu-lateral abierto" : "menu-lateral"}
        aria-label="Menú"
        aria-hidden={!abierto}
        inert={!abierto}
      >
        <div className="menu-cabecera">
          <Link href="/" className="cabecera-marca" onClick={cerrar}>
            <Logo />
            <span>{NOMBRE_APP}</span>
          </Link>
          <button type="button" className="menu-cerrar" onClick={cerrar} aria-label="Cerrar menú">×</button>
        </div>

        <nav>
          {SECCIONES.map((s, i) => (
            <div key={i} className="menu-seccion">
              {s.titulo && <h2>{s.titulo}</h2>}
              {s.enlaces.map((e) => (
                <Link
                  key={e.href}
                  href={e.href}
                  onClick={cerrar}
                  className={actual(e.href) ? "menu-enlace activo" : "menu-enlace"}
                  aria-current={actual(e.href) ? "page" : undefined}
                >
                  <span aria-hidden>{e.icono}</span>
                  {e.texto}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <p className="menu-legal">
          {LEGAL.map((l, i) => (
            <span key={l.href}>
              {i > 0 && " · "}
              <Link href={l.href} onClick={cerrar}>{l.texto}</Link>
            </span>
          ))}
        </p>
      </aside>
      </>, document.body)}
    </>
  );
}
