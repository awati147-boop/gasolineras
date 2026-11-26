import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { NOMBRE_APP } from "@/lib/app";
import { COMISION_PCT } from "@/lib/pagos";
import { pagosActivos } from "@/lib/pagosApi";
import styles from "../page.module.css";
import Calculadora from "./Calculadora";

export const metadata: Metadata = {
  title: "Alquila tu garaje",
  description: "Gana dinero con tu plaza de garaje cuando no la usas: por horas, días o meses. Publicarlo es gratis. Calcula cuánto ganarías.",
};

/** Página para dueños: calculadora de ganancias, cómo funciona y preguntas frecuentes */
export default async function AlquilaTuGaraje() {
  await connection(); // saber en cada petición si los pagos en la app están activos
  const pagos = pagosActivos();
  return (
    <main className={`${styles.main} ${styles.formulario}`}>
      <header className={styles.portada}>
        <span className={styles.etiquetaPortada2}>🏠 Para dueños de garaje</span>
        <h1 className={styles.titulo}>Tu garaje vacío puede pagarse solo</h1>
        <p className={styles.zona}>
          Alquílalo por horas, días o meses cuando no lo uses: mientras trabajas, el fin de semana o en vacaciones.
          Publicarlo es gratis y tú decides cuándo está libre.
        </p>
      </header>

      <Calculadora comisionPct={pagos ? COMISION_PCT : 0} />

      <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
        <h2 className={styles.subtitulo}>Cómo funciona</h2>
        <ol className={styles.pasosDueno}>
          <li><b>Publícalo en 2 minutos.</b> Fotos, precio y el horario en que está libre. En el mapa solo se ve una zona aproximada, nunca tu dirección.</li>
          <li><b>Tú decides.</b> Aceptas cada solicitud o activas la reserva instantánea. Bloqueas los días que lo uses desde el calendario.</li>
          <li><b>Cobra.</b> {pagos
            ? `El conductor paga en la app y recibes el dinero en tu cuenta (menos un ${COMISION_PCT} %), o lo acordáis directamente.`
            : "Acordáis el pago directamente: sin comisiones."}</li>
        </ol>
      </section>

      <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
        <h2 className={styles.subtitulo}>Preguntas frecuentes</h2>
        <details className={styles.pregunta}>
          <summary>¿Cuánto cuesta?</summary>
          <p>{pagos
            ? `Publicar es gratis. Si cobras en la app, se descuenta un ${COMISION_PCT} % de cada reserva; si cobras directamente, no pagas nada.`
            : "Nada: publicar y alquilar es gratis."}</p>
        </details>
        <details className={styles.pregunta}>
          <summary>¿Quién verá mi dirección?</summary>
          <p>Solo el conductor de una reserva que hayas aceptado. En el mapa público sale una zona aproximada de unos 100 m.</p>
        </details>
        <details className={styles.pregunta}>
          <summary>¿Sé quién va a usar mi garaje?</summary>
          <p>Ves la valoración que le han dado otros dueños y podéis hablar por el chat antes de aceptar. Puedes pedirle la matrícula.</p>
        </details>
        <details className={styles.pregunta}>
          <summary>¿Y si un día lo necesito yo?</summary>
          <p>Bloquea ese día en el calendario de tu garaje y nadie podrá reservarlo. También puedes pausar el anuncio cuando quieras.</p>
        </details>
        <details className={styles.pregunta}>
          <summary>¿Qué pasa si hay un daño?</summary>
          <p>
            El acuerdo es entre el dueño y el conductor, y {NOMBRE_APP} no responde de daños (lo explican las{" "}
            <Link href="/condiciones">condiciones de uso</Link>). Te recomendamos comprobar con tu seguro de hogar o de
            la comunidad qué cubre si alquilas la plaza.
          </p>
        </details>
      </section>

      <p className={styles.alCentro}>
        <Link href="/cuenta/publicar" className={styles.boton}>Publicar mi garaje gratis</Link>
      </p>
    </main>
  );
}
