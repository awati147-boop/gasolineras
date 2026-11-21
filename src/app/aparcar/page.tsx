import type { Metadata } from "next";
import Proximamente from "../Proximamente";

export const metadata: Metadata = { title: "Aparcar" };

export default function Aparcar() {
  return (
    <Proximamente
      icono="🅿️"
      titulo="Encuentra dónde aparcar"
      puntos={[
        "Plazas que otros conductores acaban de dejar libres cerca de ti, en tiempo real.",
        "Aviso cuando se libere una plaza a tu alrededor.",
        "Parkings públicos y de pago, y zonas de parquímetro (ORA).",
        "Garajes particulares que se alquilan por horas o días.",
      ]}
    />
  );
}
