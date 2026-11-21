// Tarifas oficiales de la ORA de Alicante (fuente: oragruaalicante.es, servicio ORA del Ayuntamiento).
// Revisar cuando entre en vigor el nuevo contrato de la ORA.
export const ORA_ALICANTE = {
  fuente: "https://www.oragruaalicante.es/ora/",
  // Término municipal de Alicante (aprox.): solo aquí se muestran estas tarifas
  zona: [-0.62, 38.28, -0.38, 38.45] as const,
  tipos: [
    {
      nombre: "Zona azul",
      color: "#2563eb",
      precio: "0,30 € / 30 min",
      maximo: "Máx. 2 h (1,80 €)",
      horario: "L–V 9–14 y 16–20 · S 9–14",
    },
    {
      nombre: "Azul media estancia",
      color: "#0ea5e9",
      precio: "0,15 € / 30 min",
      maximo: "Máx. 5 h (1,50 €)",
      horario: "L–S 9–14 y 16–20",
    },
    {
      nombre: "Zona naranja (visitantes)",
      color: "#ea580c",
      precio: "0,70 € / 30 min",
      maximo: "Máx. 1 h (1,40 €)",
      horario: "Residentes: 0,30 €/día",
    },
  ],
  avisos: "Domingos y festivos, gratis. Comprueba siempre el parquímetro y las señales.",
};

export const enAlicante = (lon: number, lat: number) => {
  const [o, s, e, n] = ORA_ALICANTE.zona;
  return lon >= o && lon <= e && lat >= s && lat <= n;
};
