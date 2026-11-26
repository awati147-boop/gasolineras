"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { COMISION_PCT, TRANSFERENCIA_H, llamarPagos } from "@/lib/pagos";
import styles from "../page.module.css";

type Estado = { estado: "sin_cuenta" | "incompleta" | "revision" | "activa"; prueba: boolean };

/** "Cobrar en la app": alta y estado de la cuenta de cobro del dueño (verificación en la página segura de pagos) */
export default function CobrosApp(config: ConfigSupabase) {
  const db = supabaseNavegador(config); // mismo cliente siempre (no cambia entre renders)
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const token = useCallback(async () => (await db.auth.getSession()).data.session?.access_token, [db]);

  const ir = useCallback(async (accion: "alta" | "panel") => {
    setError("");
    setOcupado(true);
    try {
      const { url } = await llamarPagos<{ url: string }>(await token(), "/api/pagos/cuenta", { accion });
      if (accion === "panel") {
        window.open(url, "_blank", "noopener");
        setOcupado(false);
      } else {
        window.location.assign(url); // al terminar, el proveedor de pagos vuelve a /cuenta#cobros
      }
    } catch (e) {
      setError((e as Error).message);
      setOcupado(false);
    }
  }, [token]);

  useEffect(() => {
    let vivo = true;
    // El enlace de alta caduca a los pocos minutos: si se volvió con ?cobros=repetir, se abre otro
    const repetir = window.location.search.includes("cobros=repetir");
    if (window.location.search.includes("cobros=")) window.history.replaceState(null, "", "/cuenta#cobros");
    token()
      .then((t) => llamarPagos<Estado>(t, "/api/pagos/cuenta"))
      .then((e) => {
        if (!vivo) return;
        setEstado(e);
        if (repetir && e.estado !== "activa") ir("alta");
      })
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [token, ir]);

  return (
    <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
      <div className={styles.cabBloque}>
        <h2 className={styles.subtitulo}>💶 Cobrar en la app</h2>
        {estado?.prueba && <span className={styles.etiquetaPrueba} title="No se mueve dinero real">🧪 Modo prueba</span>}
      </div>
      {error && <p className={styles.error}>{error}</p>}

      {estado === null && !error ? (
        <div className={styles.esqueleto} />
      ) : estado?.estado === "activa" ? (
        <>
          <p className={styles.estadoAceptada}>● Cobros activos</p>
          <p className={styles.zona}>
            Las nuevas reservas de tus garajes se pagan en la app. Recibes tu precio menos un {COMISION_PCT} % de
            comisión, {TRANSFERENCIA_H} h después del inicio de cada reserva.
          </p>
          <button className={styles.botonSec} onClick={() => ir("panel")} disabled={ocupado}>Ver mis cobros</button>
        </>
      ) : estado ? (
        <>
          <p className={styles.zona}>
            Los conductores pagan con tarjeta al reservar y tú recibes tu precio menos un {COMISION_PCT} % de comisión,{" "}
            {TRANSFERENCIA_H} h después del inicio de cada reserva. Sin cobros en mano ni impagos.
          </p>
          <p className={styles.notaPrivacidad}>
            🔒 Tu identidad y tu cuenta bancaria las verifica nuestro proveedor de pagos en su página segura; nosotros no
            guardamos tu IBAN.
          </p>
          {estado.estado === "revision" && (
            <p className={styles.aviso}>⏳ Estamos verificando tus datos. Suele tardar unos minutos.</p>
          )}
          <button className={styles.boton} onClick={() => ir("alta")} disabled={ocupado}>
            {ocupado ? "Abriendo…" : estado.estado === "sin_cuenta" ? "Activar cobros" : "Completar mis datos"}
          </button>
        </>
      ) : null}
    </section>
  );
}
