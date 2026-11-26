import { ImageResponse } from "next/og";

import { COLOR_APP, LOGO } from "./app";
export { NOMBRE_APP, NOMBRE_CORTO, COLOR_APP } from "./app";

/** Icono de la app (PNG cuadrado): el logotipo, igual que en la cabecera */
export function icono(tam: number, conMargen = false) {
  // "conMargen": fondo hasta el borde y símbolo más pequeño (Android recorta los iconos "maskable"
  // en círculo y el iPhone redondea las esquinas por su cuenta)
  const lado = conMargen ? tam * 0.8 : tam;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: COLOR_APP, borderRadius: conMargen ? 0 : (tam * 9) / 32,
        }}
      >
        <svg width={lado} height={lado} viewBox="0 0 32 32">
          <path d={LOGO.lineas} stroke="#fff" strokeWidth={LOGO.grosor} strokeLinecap="round" fill="none" />
          <path d={LOGO.chincheta} fill="#fff" />
          <circle cx={LOGO.punto.cx} cy={LOGO.punto.cy} r={LOGO.punto.r} fill={COLOR_APP} />
        </svg>
      </div>
    ),
    { width: tam, height: tam },
  );
}
