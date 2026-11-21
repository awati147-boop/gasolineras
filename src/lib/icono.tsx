import { ImageResponse } from "next/og";

export const NOMBRE_APP = "Gasolineras Baratas";
export const NOMBRE_CORTO = "Gasolineras";
export const COLOR_APP = "#0a7d3b";

/** Icono de la app (PNG cuadrado): fondo verde con el símbolo del euro */
export function icono(tam: number, conMargen = false) {
  // "conMargen" deja zona segura para iconos "maskable" (Android los recorta en círculo)
  const lado = conMargen ? tam * 0.62 : tam;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: COLOR_APP, borderRadius: conMargen ? 0 : tam * 0.22,
        }}
      >
        <div
          style={{
            width: lado * 0.62, height: lado * 0.62, borderRadius: "50%", background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: COLOR_APP, fontSize: lado * 0.44, fontWeight: 700,
          }}
        >
          €
        </div>
      </div>
    ),
    { width: tam, height: tam },
  );
}
