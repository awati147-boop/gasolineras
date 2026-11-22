import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_APP } from "@/lib/app";
import { ACTUALIZADO, TITULAR } from "@/lib/legal";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Condiciones de uso" };

export default function Condiciones() {
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <p><Link href="/acerca">← Acerca de</Link></p>
      <h1 className={styles.titulo}>Condiciones de uso</h1>
      <p className={styles.zona}>Última actualización: {ACTUALIZADO}</p>

      <h2 className={styles.subtitulo}>1. Qué es {NOMBRE_APP}</h2>
      <p>
        Una herramienta gratuita para encontrar carburante barato y aparcamiento, y un tablón donde particulares anuncian
        el alquiler de su garaje. <b>{NOMBRE_APP} solo pone en contacto a las partes</b>: no es propietario de los garajes,
        no interviene en el acuerdo ni, por ahora, en el pago, y no es parte del alquiler.
      </p>

      <h2 className={styles.subtitulo}>2. Cuenta</h2>
      <ul>
        <li>Necesitas una cuenta para publicar o reservar un garaje. Debes ser mayor de 18 años.</li>
        <li>Eres responsable de lo que hagas con tu cuenta y de que tus datos sean ciertos.</li>
      </ul>

      <h2 className={styles.subtitulo}>3. Si publicas un garaje</h2>
      <ul>
        <li>Declaras que tienes derecho a alquilarlo (eres el propietario o estás autorizado por él y por tu comunidad).</li>
        <li>La información, las fotos y los precios deben ser reales y estar actualizados. Pausa el anuncio si no está disponible.</li>
        <li>Eres responsable de declarar los ingresos que obtengas y de cumplir la normativa fiscal y de tu comunidad de propietarios.</li>
        <li>No incluyas en el anuncio datos personales (teléfonos, matrículas, nombres de terceros).</li>
      </ul>

      <h2 className={styles.subtitulo}>4. Si reservas un garaje</h2>
      <ul>
        <li>La solicitud no es una reserva hasta que el dueño la acepta.</li>
        <li>Usa el garaje solo en las fechas acordadas, con el vehículo indicado y respetando las normas del edificio.</li>
        <li>El precio que muestra la app es orientativo; el pago se acuerda directamente con el dueño.</li>
      </ul>

      <h2 className={styles.subtitulo}>5. Plazas libres</h2>
      <p>
        Las plazas que comparten otros conductores son orientativas y pueden estar ocupadas al llegar. Respeta siempre las
        normas de tráfico y la señalización.
      </p>

      <h2 className={styles.subtitulo}>6. Normas de convivencia</h2>
      <ul>
        <li>Prohibido publicar contenido falso, ofensivo, discriminatorio o ilegal, y usar el chat para spam o estafas.</li>
        <li>No compartas datos bancarios ni contraseñas por el chat.</li>
        <li>Puedes denunciar anuncios y conversaciones. Podemos retirar contenido y suspender cuentas que incumplan estas condiciones.</li>
      </ul>

      <h2 className={styles.subtitulo}>7. Responsabilidad</h2>
      <p>
        Los acuerdos entre usuarios son responsabilidad exclusiva de ellos. {NOMBRE_APP} no responde de daños, robos,
        incumplimientos o desacuerdos derivados de un alquiler, ni de la exactitud de los datos de terceros (precios de
        carburantes, aparcamientos). El servicio se ofrece tal cual y puede interrumpirse o cambiar.
      </p>

      <h2 className={styles.subtitulo}>8. Cambios y contacto</h2>
      <p>
        Podemos actualizar estas condiciones; la fecha de arriba indica la última versión. Para cualquier duda o
        reclamación: <b>{TITULAR.email}</b>. Se aplica la legislación española.
      </p>
      <p>
        Ver también: <Link href="/privacidad">Política de privacidad</Link> · <Link href="/aviso-legal">Aviso legal</Link>.
      </p>
    </main>
  );
}
