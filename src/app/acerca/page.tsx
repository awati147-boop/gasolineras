import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_APP } from "@/lib/app";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Acerca de" };

export default function Acerca() {
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <p><Link href="/">← Volver al mapa</Link></p>
      <h1 className={styles.titulo}>Acerca de {NOMBRE_APP}</h1>
      <p>
        {NOMBRE_APP} es la app para moverte en coche por la ciudad, en un solo mapa:
      </p>
      <ul>
        <li><strong>⛽ Gasolina:</strong> las gasolineras más baratas de España, con los precios oficiales de cada carburante.</li>
        <li><strong>🅿️ Aparcar:</strong> plazas que otros acaban de dejar libres, parkings y parquímetros.</li>
        <li><strong>🚗 Me voy:</strong> avisa con un toque de que dejas tu plaza para que la aproveche otro conductor.</li>
        <li><strong>🏠 Garajes:</strong> alquila un garaje por horas o días, o gana dinero con el tuyo cuando no lo usas.</li>
      </ul>
      <p>Es gratuita y, salvo para los garajes, no necesita registro.</p>

      <h2 className={styles.subtitulo}>De dónde salen los datos</h2>
      <ul>
        <li>
          <strong>Precios y gasolineras:</strong> Ministerio para la Transición Ecológica y el Reto Demográfico,{" "}
          <a href="https://geoportalgasolineras.es/" target="_blank" rel="noopener">Geoportal de gasolineras</a>{" "}
          (datos abiertos). Se actualizan varias veces al día. La fecha de la última actualización aparece arriba en la
          página principal; si el servicio del Ministerio no responde, mostramos el último dato guardado.
        </li>
        <li>
          <strong>Puntos de recarga de coche eléctrico:</strong> datos oficiales del Ministerio para la Transición
          Ecológica (MITECO), publicados por la DGT en el{" "}
          <a href="https://nap.dgt.es/dataset/puntos-de-recarga-electrica-para-vehiculos" target="_blank" rel="noopener">Punto de Acceso Nacional</a>.
          Se actualizan cada día. El precio de la recarga lo fija cada operador.
        </li>
        <li>
          <strong>Mapa:</strong> ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>.
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
        <li>
          Para ver precios, aparcar o dejar tu plaza no necesitas cuenta. Solo la pedimos para publicar o reservar un
          garaje. Detalles en la <Link href="/privacidad">Política de privacidad</Link>.
        </li>
        <li>
          Si pulsas «Cerca de mí», tu ubicación se usa <strong>solo en tu dispositivo</strong> para centrar el mapa y
          calcular distancias. No se envía a nuestros servidores ni se guarda.
        </li>
        <li>No usamos cookies de publicidad ni de seguimiento.</li>
      </ul>

      <h2 className={styles.subtitulo} id="instalar">Instalar en el móvil</h2>
      <ul>
        <li><strong>Android (Chrome):</strong> menú ⋮ → «Instalar aplicación» o «Añadir a pantalla de inicio».</li>
        <li><strong>iPhone (Safari):</strong> botón Compartir → «Añadir a pantalla de inicio».</li>
      </ul>
    </main>
  );
}
