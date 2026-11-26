"use client";

import { useState } from "react";
import Link from "next/link";
import { OCUPACIONES, estimarGanancias } from "@/lib/ganancias";
import styles from "../page.module.css";

const euros = (n: number) => `${n.toLocaleString("es-ES")} €`;

/** Calculadora: precio por hora, horas y días libres y cuánto se alquilaría → euros al mes */
export default function Calculadora({ comisionPct }: { comisionPct: number }) {
  const [precio, setPrecio] = useState("2");
  const [horas, setHoras] = useState(9);
  const [dias, setDias] = useState(5);
  const [ocupacion, setOcupacion] = useState(OCUPACIONES[1].valor);

  const precioHora = Math.min(20, Math.max(0, Number(precio.replace(",", ".")) || 0));
  const r = estimarGanancias({ precioHora, horasDia: horas, diasSemana: dias, ocupacion, comisionPct });

  return (
    <section className={`${styles.tarjeta} ${styles.calculadora}`} aria-label="Calculadora de ganancias">
      <h2 className={styles.subtitulo}>¿Cuánto ganarías?</h2>
      <div className={styles.fila2}>
        <label className={styles.campo}>
          Precio por hora
          <span className={styles.conEuro}>
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" aria-describedby="ref-precio" />
            <i>€</i>
          </span>
        </label>
        <label className={styles.campo}>
          Días a la semana
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d === 7 ? "Todos" : d === 5 ? "5 (laborables)" : d === 2 ? "2 (fin de semana)" : d}</option>)}
          </select>
        </label>
      </div>
      <p className={styles.notaPrivacidad} id="ref-precio">Referencia en Alicante: los parkings públicos cobran entre 1,50 y 2,50 €/h.</p>
      <label className={styles.campo}>
        Horas libres al día: <b>{horas} h</b>
        <input type="range" min={1} max={24} value={horas} onChange={(e) => setHoras(Number(e.target.value))} className={styles.deslizador} />
      </label>
      <div className={styles.campo}>
        ¿Cuánto se alquilará?
        <nav className={styles.chips} aria-label="Demanda">
          {OCUPACIONES.map((o) => (
            <button key={o.nombre} type="button" onClick={() => setOcupacion(o.valor)} aria-pressed={ocupacion === o.valor}
              className={ocupacion === o.valor ? styles.chipActivo : styles.chip}>
              {o.nombre} · {Math.round(o.valor * 100)} %
            </button>
          ))}
        </nav>
        <small>{OCUPACIONES.find((o) => o.valor === ocupacion)?.texto}</small>
      </div>

      <div className={styles.resultadoCalculo} aria-live="polite">
        <small>Podrías ganar unos</small>
        <b>{euros(r.neto)} al mes</b>
        <span>≈ {euros(r.anual)} al año · {r.horasMes} h alquiladas al mes</span>
      </div>
      <p className={styles.notaPrivacidad}>
        Estimación orientativa: depende de la demanda de tu zona, de tu precio y de tu horario.
        {comisionPct > 0 && ` Ya está descontada la comisión del ${comisionPct} % si cobras en la app.`}
      </p>
      <Link href="/cuenta/publicar" className={`${styles.boton} ${styles.botonAncho}`}>Publicar mi garaje gratis</Link>
    </section>
  );
}
