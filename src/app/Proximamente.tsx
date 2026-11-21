import styles from "./page.module.css";

/** Pantalla provisional para las secciones que aún no están hechas */
export default function Proximamente({ icono, titulo, puntos }: { icono: string; titulo: string; puntos: string[] }) {
  return (
    <main className={`${styles.main} ${styles.texto}`}>
      <div className={styles.proximamente}>
        <div className={styles.proxIcono} aria-hidden>{icono}</div>
        <h1 className={styles.titulo}>{titulo}</h1>
        <p className={styles.fecha}>Próximamente</p>
        <ul>
          {puntos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
