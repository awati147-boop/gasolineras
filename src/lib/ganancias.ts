// Estimación orientativa de lo que puede ganar un dueño alquilando su garaje por horas

export const SEMANAS_MES = 52 / 12; // ≈ 4,33

export type Supuestos = {
  precioHora: number; // €/h
  horasDia: number; // horas libres al día
  diasSemana: number; // días libres a la semana
  ocupacion: number; // parte de esas horas que se alquila (0–1)
  comisionPct: number; // comisión por reserva si se cobra en la app (0 si el pago es directo)
};

/** Euros al mes y al año (ya sin la comisión) */
export function estimarGanancias(s: Supuestos) {
  const horasMes = s.horasDia * s.diasSemana * SEMANAS_MES * s.ocupacion;
  const bruto = horasMes * s.precioHora;
  const neto = bruto * (1 - s.comisionPct / 100);
  // Redondeo a euros: es una estimación, los céntimos darían una falsa precisión
  return { horasMes: Math.round(horasMes), bruto: Math.round(bruto), neto: Math.round(neto), anual: Math.round(neto * 12) };
}

export const OCUPACIONES = [
  { nombre: "Poca", valor: 0.15, texto: "zona tranquila" },
  { nombre: "Normal", valor: 0.3, texto: "barrio con poco aparcamiento" },
  { nombre: "Mucha", valor: 0.6, texto: "centro, playa, hospital…" },
];
