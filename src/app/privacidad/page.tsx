import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_APP } from "@/lib/app";
import { ACTUALIZADO, TITULAR, contacto } from "@/lib/legal";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <p><Link href="/acerca">← Acerca de</Link></p>
      <h1 className={styles.titulo}>Política de privacidad</h1>
      <p className={styles.zona}>Última actualización: {ACTUALIZADO}</p>

      <p>
        En {NOMBRE_APP} recogemos los menos datos posibles. Para ver precios, aparcamientos o dejar una plaza libre{" "}
        <b>no necesitas cuenta</b> y no guardamos nada que te identifique.
      </p>

      <h2 className={styles.subtitulo}>Responsable</h2>
      <p>{[TITULAR.nombre, TITULAR.nif && `NIF ${TITULAR.nif}`, contacto()].filter(Boolean).join(" · ")}</p>

      <h2 className={styles.subtitulo}>Qué datos tratamos y para qué</h2>
      <ul>
        <li>
          <b>Tu ubicación:</b> solo se usa <b>en tu dispositivo</b> para centrar el mapa y calcular distancias. No se envía
          ni se guarda. Si dejas una plaza libre, se guarda únicamente el punto de esa plaza durante 10 minutos, sin
          vincularlo a tu identidad.
        </li>
        <li>
          <b>Cuenta</b> (solo si publicas o reservas un garaje): email, nombre y foto de perfil de Google si entras con
          Google. Sirven para identificarte y gestionar tus anuncios y reservas.
        </li>
        <li>
          <b>Anuncios de garajes:</b> los datos que escribes, las fotos y la ubicación. En el mapa público solo se muestra
          una zona aproximada (unos 100 m); la dirección exacta solo la ve la persona cuya reserva aceptes.
        </li>
        <li>
          <b>Reservas y mensajes:</b> fechas, precio y los mensajes del chat. Solo los ven las dos partes de la reserva y,
          si hay una denuncia, el titular para revisarla.
        </li>
        <li><b>Denuncias:</b> el motivo y el comentario, para moderar la plataforma.</li>
        <li>
          <b>Avisos (notificaciones):</b> si los activas, guardamos la dirección técnica de tu dispositivo que da el
          navegador para poder enviarte avisos de tus reservas y mensajes. No incluye tu ubicación.
        </li>
      </ul>
      <p>
        <b>No hacemos perfiles</b> de usuarios, no usamos tus datos para publicidad personalizada y no los cedemos a nadie
        con fines comerciales.
      </p>

      <h2 className={styles.subtitulo}>Base legal</h2>
      <p>
        La ejecución del servicio que solicitas (art. 6.1.b RGPD) para la cuenta, anuncios, reservas y chat, y el interés
        legítimo en mantener la plataforma segura (art. 6.1.f RGPD) para la moderación y la prevención de abusos.
      </p>

      <h2 className={styles.subtitulo}>Con quién se comparten</h2>
      <p>
        No vendemos ni cedemos tus datos. Solo los tratan, por nuestra cuenta y con contrato, los proveedores técnicos
        que necesitamos para dar el servicio (alojamiento de la web, base de datos y autenticación) y, si eliges entrar
        con Google, Google. Si activas los avisos, el servicio de notificaciones de tu navegador los entrega cifrados:
        no puede leer su contenido. Algunos proveedores pueden tratar datos fuera del Espacio Económico Europeo con las
        garantías previstas en el RGPD (Marco de Privacidad de Datos UE-EE. UU. o cláusulas contractuales tipo).
      </p>

      <h2 className={styles.subtitulo}>Publicidad y contenido patrocinado</h2>
      <p>
        {NOMBRE_APP} puede mostrar contenido patrocinado de negocios relacionados con la conducción (por ejemplo,
        parkings, talleres o seguros). Siempre aparece <b>separado y marcado como «Patrocinado»</b>, y nunca cambia el
        orden de los resultados: la gasolinera más barata sigue siendo la primera aunque no pague.
      </p>
      <p>
        Estos contenidos <b>no usan tus datos personales ni tu ubicación</b>: se eligen por la zona que estás viendo en el
        mapa, sin guardarla. Si algún día usáramos anuncios de terceros con cookies o seguimiento, te pediríamos permiso
        antes y lo explicaríamos en la <Link href="/cookies">Política de cookies</Link>.
      </p>

      <h2 className={styles.subtitulo}>Cuánto tiempo</h2>
      <ul>
        <li>Plazas libres: 10 minutos.</li>
        <li>Avisos: hasta que los desactives o el navegador deje de aceptarlos.</li>
        <li>Cuenta, anuncios, reservas y mensajes: mientras tengas la cuenta. Al borrarla se eliminan.</li>
        <li>Lo que la ley obligue a conservar, durante el plazo legal.</li>
      </ul>

      <h2 className={styles.subtitulo}>Cookies y almacenamiento</h2>
      <p>
        No usamos cookies de publicidad ni de seguimiento. Solo guardamos en tu navegador lo necesario para que la app
        funcione (tu sesión y si ya cerraste el aviso de instalar la app). Más detalle en la{" "}
        <Link href="/cookies">Política de cookies</Link>.
      </p>

      <h2 className={styles.subtitulo}>Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas para proteger tus datos: conexiones cifradas y acceso limitado a lo
        que a cada persona le corresponde. Por ejemplo, nadie puede saber quién dejó una plaza libre, y la dirección
        exacta de un garaje solo la ve quien tiene la reserva aceptada.
      </p>

      <h2 className={styles.subtitulo}>Menores</h2>
      <p>
        Para crear una cuenta (publicar o reservar garajes) debes ser mayor de edad. Si sabes que un menor nos ha dado sus
        datos, escríbenos y los borraremos.
      </p>

      <h2 className={styles.subtitulo}>Tus derechos</h2>
      <p>
        Puedes pedir acceso, rectificación, supresión (borrar tu cuenta y tus datos), oposición, limitación y portabilidad
        escribiendo a <b>{contacto()}</b>. Si no quedas satisfecho, puedes reclamar ante la Agencia Española de
        Protección de Datos (aepd.es).
      </p>

      <h2 className={styles.subtitulo}>Cambios</h2>
      <p>
        Si cambiamos esta política, actualizaremos la fecha de arriba. Si el cambio es importante (por ejemplo, un nuevo
        uso de tus datos), lo avisaremos en la app antes de que se aplique.
      </p>
    </main>
  );
}
