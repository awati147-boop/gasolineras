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
        aparcamientos y parquímetros, de OpenStreetMap; las tarifas de la ORA, del servicio municipal correspondiente.
        Se muestran tal como los publican sus fuentes y pueden no estar actualizados. Las plazas libres y los anuncios de
        garajes los publican los propios usuarios. El titular no garantiza su exactitud ni se hace responsable de las
        decisiones tomadas a partir de ellos.
      </p>

      <h2 className={styles.subtitulo}>Propiedad intelectual</h2>
      <p>
        El diseño y el código de la web pertenecen al titular. Los datos de OpenStreetMap se usan bajo licencia ODbL
        (© colaboradores de OpenStreetMap). Las marcas comerciales citadas pertenecen a sus propietarios; los distintivos
        de colores no son sus logotipos oficiales.
      </p>

      <h2 className={styles.subtitulo}>Más información</h2>
      <p>
        Consulta también la <Link href="/privacidad">Política de privacidad</Link> y las{" "}
        <Link href="/condiciones">Condiciones de uso</Link>.
      </p>
    </main>
  );
}
