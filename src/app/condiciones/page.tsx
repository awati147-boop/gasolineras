import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { NOMBRE_APP } from "@/lib/app";
import { ACTUALIZADO, contacto } from "@/lib/legal";
import { COMISION_PCT, RESPUESTA_H, TARIFA_MIN, TARIFA_PCT, TRANSFERENCIA_H } from "@/lib/pagos";
import { pagosActivos } from "@/lib/pagosApi";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Condiciones de uso" };

export default async function Condiciones() {
  await connection(); // los apartados de pagos dependen de la configuración del servidor
  const pagos = pagosActivos();
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <p><Link href="/acerca">← Acerca de</Link></p>
      <h1 className={styles.titulo}>Condiciones de uso</h1>
      <p className={styles.zona}>Última actualización: {ACTUALIZADO}</p>

      <h2 className={styles.subtitulo}>1. Qué es {NOMBRE_APP}</h2>
      <p>
        Una herramienta gratuita para encontrar carburante barato y aparcamiento, y un tablón donde particulares anuncian
        el alquiler de su garaje. <b>{NOMBRE_APP} solo pone en contacto a las partes</b>: no es propietario de los garajes,
        no interviene en el acuerdo y no es parte del alquiler.{" "}
        {pagos
          ? "En los garajes que lo indican, el pago se hace en la app a través de un proveedor de pagos autorizado; en los demás, directamente con el dueño."
          : "Por ahora, el pago se hace directamente con el dueño."}
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
        {pagos && (
          <li>
            <b>Cobrar en la app (opcional):</b> el proveedor de pagos verificará tu identidad y tu cuenta bancaria.
            Recibes tu precio menos una comisión del {COMISION_PCT} %, {TRANSFERENCIA_H} horas después del inicio de cada
            reserva. Si hay una reclamación, el pago puede retenerse mientras se revisa. La normativa fiscal (DAC7) puede
            obligarnos a comunicar tus ingresos a la Agencia Tributaria; te pediremos los datos necesarios.
          </li>
        )}
      </ul>

      <h2 className={styles.subtitulo}>4. Si reservas un garaje</h2>
      <ul>
        <li>La solicitud no es una reserva hasta que el dueño la acepta.</li>
        <li>Usa el garaje solo en las fechas acordadas, con el vehículo indicado y respetando las normas del edificio.</li>
        {pagos ? (
          <>
            <li>
              El precio lo fija cada dueño. En los garajes que se pagan en la app se añade una <b>tarifa de servicio del{" "}
              {TARIFA_PCT} % (mínimo {String(TARIFA_MIN.toFixed(2)).replace(".", ",")} €)</b>, que ves por separado antes de
              pagar. El total es lo que pagas, sin otros cargos.
            </li>
            <li>
              Al pedir la reserva se <b>retiene</b> el importe en tu tarjeta y <b>solo se cobra si el dueño acepta</b>. Si la
              rechaza o no responde en {RESPUESTA_H} horas, se libera. Una solicitud sin pagar se cancela sola en 1 hora.
            </li>
            <li>En los demás garajes, el pago se hace directamente con el dueño y {NOMBRE_APP} no cobra tarifa de servicio.</li>
          </>
        ) : (
          <li>
            El precio lo fija cada dueño. El total que ves al reservar es el que se acuerda, sin cargos añadidos; por ahora
            el pago se hace directamente con el dueño y {NOMBRE_APP} no cobra tarifa de servicio.
          </li>
        )}
      </ul>

      <h3 id="cancelacion" className={styles.ancla}>Cancelaciones</h3>
      <ul>
        <li>Cualquiera de las partes puede cancelar desde la reserva. La otra parte recibe un aviso.</li>
        <li>
          <b>Hasta 24 horas antes del inicio</b>, la cancelación es gratuita: si ya habías pagado algo al dueño, debe
          devolvértelo entero.
        </li>
        <li>
          <b>Con menos de 24 horas</b>, el dueño puede quedarse con lo que le hayas pagado por adelantado, como mucho el
          importe de la reserva.
        </li>
        <li>Si cancela el dueño, en cualquier momento, debe devolverte todo lo que le hayas pagado.</li>
        {pagos && (
          <li>
            <b>Si pagaste en la app</b>, todo esto se hace solo: la devolución va al mismo medio de pago (el banco puede
            tardar de 5 a 10 días en mostrarla) y, si cancelas con menos de 24 horas, el dueño recibe su parte y la tarifa
            de servicio no se devuelve.
          </li>
        )}
        <li>Si al llegar no puedes usar el garaje por causa del dueño, avísale por el chat y, si no se resuelve, denúncialo desde la reserva.</li>
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

      <h2 className={styles.subtitulo}>8. Contenido patrocinado</h2>
      <p>
        Puede haber anuncios de negocios relacionados con la conducción. Siempre van marcados como «Patrocinado» y nunca
        cambian el orden de los resultados. Lo que contrates con un anunciante es un acuerdo entre tú y él.
      </p>

      <h2 className={styles.subtitulo}>9. Cambios y contacto</h2>
      <p>
        Podemos actualizar estas condiciones; la fecha de arriba indica la última versión. Para cualquier duda o
        reclamación: <b>{contacto()}</b>. Se aplica la legislación española.
      </p>
      <p>
        Ver también: <Link href="/privacidad">Política de privacidad</Link> · <Link href="/aviso-legal">Aviso legal</Link>.
      </p>
    </main>
  );
}
