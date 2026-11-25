import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_APP } from "@/lib/app";
import { ACTUALIZADO, TITULAR, contacto } from "@/lib/legal";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Aviso legal" };

export default function AvisoLegal() {
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <p><Link href="/acerca">← Acerca de</Link></p>
      <h1 className={styles.titulo}>Aviso legal</h1>
      <p className={styles.zona}>Última actualización: {ACTUALIZADO}</p>

      <h2 className={styles.subtitulo}>Titular de la web</h2>
      <p>
        En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI),
        se informa de que {NOMBRE_APP} es un servicio de:
      </p>
      <ul>
        {TITULAR.nombre && <li><b>Titular:</b> {TITULAR.nombre}</li>}
        {TITULAR.nif && <li><b>NIF:</b> {TITULAR.nif}</li>}
        {TITULAR.domicilio && <li><b>Domicilio:</b> {TITULAR.domicilio}</li>}
        <li><b>Contacto:</b> {contacto()}</li>
      </ul>

      <h2 className={styles.subtitulo}>Objeto</h2>
      <p>
        {NOMBRE_APP} muestra información sobre precios de carburantes, aparcamientos y plazas libres, y permite a particulares
        anunciar el alquiler de su garaje y ponerse en contacto con conductores interesados.
      </p>

      <h2 className={styles.subtitulo}>Información mostrada</h2>
      <p>
        Los precios de carburantes proceden del Ministerio para la Transición Ecológica y el Reto Demográfico; los
        aparcamientos y parquímetros, de OpenStreetMap; las calles de zona regulada, de los portales de datos abiertos de
        los ayuntamientos (Madrid, Barcelona y València); las tarifas de la ORA, del servicio municipal correspondiente.
        Se muestran tal como los publican sus fuentes y pueden no estar actualizados. Las plazas libres y los anuncios de
        garajes los publican los propios usuarios. El titular no garantiza su exactitud ni se hace responsable de las
        decisiones tomadas a partir de ellos.
      </p>
      <p>
        <b>La información es orientativa:</b> las señales de tráfico, los parquímetros y las indicaciones de los agentes
        prevalecen siempre sobre lo que muestre la app. El titular no responde de multas ni de retiradas de vehículos.
      </p>

      <h2 className={styles.subtitulo}>Contenido patrocinado</h2>
      <p>
        La web puede incluir contenido patrocinado de terceros, siempre identificado como «Patrocinado» y separado de los
        resultados, cuyo orden no se vende. El anunciante es responsable de la veracidad de su anuncio.
      </p>

      <h2 className={styles.subtitulo}>Enlaces a otros sitios</h2>
      <p>
        Los enlaces externos (por ejemplo, «Cómo llegar», que abre Google Maps, o las webs de los operadores) llevan a
        servicios de terceros con sus propias condiciones, de cuyo contenido el titular no se hace responsable.
      </p>

      <h2 className={styles.subtitulo}>Propiedad intelectual</h2>
      <p>
        El diseño y el código de la web pertenecen al titular. Los datos de OpenStreetMap se usan bajo licencia ODbL
        (© colaboradores de OpenStreetMap), y los de los ayuntamientos según la licencia de cada portal (CC BY 4.0 o
        equivalente), citando su fuente. Las marcas comerciales citadas pertenecen a sus propietarios; los distintivos
        de colores no son sus logotipos oficiales.
      </p>
      <p>
        No está permitido extraer de forma masiva o automatizada los contenidos propios de la web (anuncios, fotos o
        datos aportados por los usuarios) sin autorización escrita del titular.
      </p>

      <h2 className={styles.subtitulo}>Cambios y legislación</h2>
      <p>
        El titular puede modificar este aviso en cualquier momento; la fecha de arriba indica la última versión. Se
        aplica la legislación española. Para cualquier conflicto, los juzgados competentes serán los que correspondan
        según la ley; si eres consumidor, los de tu domicilio.
      </p>

      <h2 className={styles.subtitulo}>Más información</h2>
      <p>
        Consulta también la <Link href="/privacidad">Política de privacidad</Link>, la{" "}
        <Link href="/cookies">Política de cookies</Link> y las <Link href="/condiciones">Condiciones de uso</Link>.
      </p>
    </main>
  );
}
