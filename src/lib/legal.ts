// Datos del responsable de la web (obligatorios por la LSSI y el RGPD).
// ⚠️ Vacíos de momento: RELLENAR antes de publicar los garajes (como mínimo nombre y email).
export const TITULAR = {
  nombre: "Abdel Awati Lasshab",
  nif: "",
  domicilio: "",
  email: "",
};

export const ACTUALIZADO = "noviembre de 2026";

/** Texto para el email de contacto (si aún no está, se indica de forma neutra) */
export const contacto = () => TITULAR.email || "el email de contacto que se indicará aquí";
