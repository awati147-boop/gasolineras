import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_APP } from "@/lib/icono";
import styles from "../page.module.css";

export const metadata: Metadata = { title: `Acerca de · ${NOMBRE_APP}` };

export default function Acerca() {
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <p><Link href="/">← Volver al mapa</Link></p>
      <h1 className={styles.titulo}>Acerca de {NOMBRE_APP}</h1>
      <p>
        {NOMBRE_APP} te muestra en un mapa las gasolineras más baratas de España, con los precios oficiales de cada
        carburante. Es gratuita y no necesita registro.
      </p>

      <h2 className={styles.subtitulo}>De dónde salen los datos</h2>
      <ul>
        <li>
          <strong>Precios y gasolineras:</strong> Ministerio para la Transición Ecológica y el Reto Demográfico,{" "}
          <a href="https://geoportalgasolineras.es/" target="_blank" rel="noopener">Geoportal de gasolineras</a>{" "}
          (datos abiertos). Se actualizan varias veces al día. La fecha de la última actualización aparece arriba en la
          página principal; si el servicio del Ministerio no responde, mostramos el último dato guardado.
        </li>
        <li>
          <strong>Mapa:</strong> ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>
          , con <a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>.
        </li>
        <li>
          Los precios los comunican las propias gasolineras. Pueden cambiar en cualquier momento: comprueba el precio
          en el surtidor antes de repostar.
        </li>
        <li>
          Los distintivos de colores con iniciales no son los logotipos oficiales de las marcas; solo sirven para
          reconocerlas de un vistazo. Las marcas pertenecen a sus propietarios.
        </li>
        <li>No se muestran las gasolineras de venta restringida (solo para socios o flotas).</li>
      </ul>

      <h2 className={styles.subtitulo}>Privacidad</h2>
      <ul>
        <li>No hay cuentas ni registro, y no guardamos datos personales.</li>
        <li>
          Si pulsas «Cerca de mí», tu ubicación se usa <strong>solo en tu dispositivo</strong> para centrar el mapa y
          calcular distancias. No se envía a nuestros servidores ni se guarda.
        </li>
        <li>No usamos cookies de publicidad ni de seguimiento.</li>
      </ul>

      <h2 className={styles.subtitulo}>Instalar en el móvil</h2>
      <ul>
        <li><strong>Android (Chrome):</strong> menú ⋮ → «Instalar aplicación» o «Añadir a pantalla de inicio».</li>
        <li><strong>iPhone (Safari):</strong> botón Compartir → «Añadir a pantalla de inicio».</li>
      </ul>
    </main>
  );
}
