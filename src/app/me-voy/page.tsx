import type { Metadata } from "next";
import Proximamente from "../Proximamente";

export const metadata: Metadata = { title: "Me voy" };

export default function MeVoy() {
  return (
    <Proximamente
      icono="🚗"
      titulo="¿Te vas? Deja tu plaza"
      puntos={[
        "Pulsa un botón al salir y avisaremos a los conductores que buscan aparcamiento cerca.",
        "Sin registro: no te pedimos nombre ni email.",
        "Solo se guarda el punto de la plaza, y se borra a los 10 minutos.",
      ]}
    />
  );
}
