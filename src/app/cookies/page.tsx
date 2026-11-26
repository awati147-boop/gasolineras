import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_APP } from "@/lib/app";
import { ACTUALIZADO, contacto } from "@/lib/legal";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Política de cookies" };

// Lo que la app guarda en el navegador (revisar si se añade analítica o anuncios de terceros)
const ALMACENAMIENTO = [
  { nombre: "Sesión", para: "Mantener tu sesión: anónima para dejar plazas, o tu cuenta.", dura: "Hasta que cierres sesión" },
  { nombre: "Aviso de instalar la app", para: "Recordar que ya lo cerraste, para no volver a mostrarlo.", dura: "Hasta que borres los datos del navegador" },
  { nombre: "Avisos", para: "Recibir los avisos de reservas y mensajes, solo si los activas.", dura: "Hasta que los desactives" },
  { nombre: "Gasolineras favoritas", para: "Recordar las gasolineras que guardas y el último precio que viste, para decirte si ha bajado. No sale de tu móvil.", dura: "Hasta que las quites" },
  { nombre: "Dónde aparcaste", para: "Recordar dónde dejaste el coche y hasta qué hora dura el ticket, solo si pulsas «He aparcado aquí». No sale de tu móvil.", dura: "Hasta que lo quites, o 3 días" },
];

export default function Cookies() {
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <p><Link href="/acerca">← Acerca de</Link></p>
      <h1 className={styles.titulo}>Política de cookies</h1>
      <p className={styles.zona}>Última actualización: {ACTUALIZADO}</p>

      <h2 className={styles.subtitulo}>Qué son</h2>
      <p>
        Las cookies y el almacenamiento local son pequeños datos que una web guarda en tu navegador. Algunos son
        imprescindibles para que funcione; otros sirven para medir visitas o mostrar publicidad.
      </p>

      <h2 className={styles.subtitulo}>Qué usamos</h2>
      <p>
        {NOMBRE_APP} <b>solo usa almacenamiento técnico</b>, necesario para que la app funcione. No usamos cookies de
        análisis, de publicidad ni de redes sociales, y no hay nada de terceros que te rastree.
      </p>
      <div className={styles.tablaLegal}>
        <table>
          <thead>
            <tr><th>Qué</th><th>Para qué</th><th>Cuánto dura</th></tr>
          </thead>
          <tbody>
            {ALMACENAMIENTO.map((a) => (
              <tr key={a.nombre}><td>{a.nombre}</td><td>{a.para}</td><td>{a.dura}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={styles.subtitulo}>Base legal</h2>
      <p>
        Al ser estrictamente necesario para el servicio que pides, este almacenamiento no requiere consentimiento (artículo
        22.2 de la LSSI). Por eso no verás un aviso de cookies.
      </p>

      <h2 className={styles.subtitulo}>Si esto cambia</h2>
      <p>
        Si en el futuro añadimos analítica o anuncios de terceros que usen cookies, <b>no se activarán sin tu permiso</b>:
        verás un aviso donde aceptar o rechazar con la misma facilidad, y podrás cambiar de opinión cuando quieras. Lo
        indicaremos en esta página.
      </p>

      <h2 className={styles.subtitulo}>Cómo borrarlas</h2>
      <p>
        Puedes borrar estos datos desde los ajustes de tu navegador (Privacidad → Borrar datos de navegación). Si lo haces,
        se cerrará tu sesión y dejarás de recibir avisos en ese dispositivo.
      </p>

      <p>
        Dudas: <b>{contacto()}</b>. Ver también la <Link href="/privacidad">Política de privacidad</Link> y el{" "}
        <Link href="/aviso-legal">Aviso legal</Link>.
      </p>
    </main>
  );
}
