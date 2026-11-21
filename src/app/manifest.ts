import type { MetadataRoute } from "next";
import { COLOR_APP, NOMBRE_APP, NOMBRE_CORTO } from "@/lib/icono";

// Manifiesto de la PWA: permite "Instalar app" / "Añadir a pantalla de inicio"
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE_APP,
    short_name: NOMBRE_CORTO,
    description: "Las gasolineras más baratas cerca de ti, en un mapa.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: COLOR_APP,
    icons: [
      { src: "/iconos/192.png", sizes: "192x192", type: "image/png" },
      { src: "/iconos/512.png", sizes: "512x512", type: "image/png" },
      { src: "/iconos/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
