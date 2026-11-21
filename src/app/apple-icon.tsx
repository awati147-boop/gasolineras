import { icono } from "@/lib/icono";

// Icono para "Añadir a pantalla de inicio" en iPhone
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return icono(180, true);
}
