"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import styles from "../page.module.css";
import { IconoCheck, IconoInfo } from "../Iconos";

/** Usuario con cuenta "de verdad" (Google o email), no el anónimo de "Me voy" */
const tieneCuenta = (u: User | null) => Boolean(u && !u.is_anonymous && u.email);

export default function MiCuenta(config: ConfigSupabase) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const db = supabaseNavegador(config);
    // Si venimos de Google o del enlace del email, el cliente canjea el código de la URL automáticamente
    db.auth.getUser().then(({ data }) => {
      setUsuario(data.user);
      setCargando(false);
    });
    const { data: sub } = db.auth.onAuthStateChange((_evento, sesion) => {
      setUsuario(sesion?.user ?? null);
      setCargando(false);
      if (sesion && window.location.search.includes("code=")) {
        window.history.replaceState(null, "", "/cuenta"); // limpiar la URL
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [config]);

  const volverA = () => `${window.location.origin}/cuenta`;

  async function conGoogle() {
    setError("");
    setOcupado(true);
    const { error } = await supabaseNavegador(config).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: volverA() },
    });
    if (error) {
      setOcupado(false);
      setError("No se ha podido abrir Google. Inténtalo de nuevo.");
    }
  }

  async function conEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOcupado(true);
    const { error } = await supabaseNavegador(config).auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: volverA(), shouldCreateUser: true },
    });
    setOcupado(false);
    if (error) {
      setError(
        /rate|limit|seconds/i.test(error.message)
          ? "Has pedido varios enlaces seguidos. Espera un minuto y vuelve a intentarlo."
          : "No se ha podido enviar el enlace. Revisa el email.",
      );
    } else setEnviado(true);
  }

  async function salir() {
    await supabaseNavegador(config).auth.signOut();
    setUsuario(null);
    setEnviado(false);
  }

  if (cargando) return <div className={styles.esqueleto} style={{ height: 220 }} aria-label="Cargando" />;

  // ---------- Con cuenta ----------
  if (tieneCuenta(usuario)) {
    const nombre = (usuario!.user_metadata?.full_name as string | undefined) ?? usuario!.email!.split("@")[0];
    const foto = usuario!.user_metadata?.avatar_url as string | undefined;
    return (
      <>
        <div className={styles.avatar} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {foto ? <img src={foto} alt="" referrerPolicy="no-referrer" /> : nombre.charAt(0).toUpperCase()}
        </div>
        <h1 className={styles.titulo}>Hola, {nombre}</h1>
        <p className={styles.zona}>{usuario!.email}</p>

        <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
          <h2 className={styles.subtitulo}>🏠 Mis garajes</h2>
          <p className={styles.zona}>Muy pronto podrás publicar tu garaje y alquilarlo por horas o días.</p>
        </section>

        <div className={styles.acciones}>
          <button className={styles.botonSec} onClick={salir}>Cerrar sesión</button>
        </div>
        <p className={styles.zona} style={{ marginTop: 16 }}>
          <Link href="/acerca">Privacidad</Link> · Para borrar tu cuenta y tus datos, escríbenos desde la página Acerca de.
        </p>
      </>
    );
  }

  // ---------- Sin cuenta ----------
  return (
    <>
      <h1 className={styles.titulo}>Entra en tu cuenta</h1>
      <p className={styles.zona}>
        Solo hace falta para <b>publicar tu garaje</b> o <b>reservar uno</b>. Para ver precios, aparcar o dejar tu plaza, no.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.bloqueEntrar}>
        <button className={styles.botonGoogle} onClick={conGoogle} disabled={ocupado}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuar con Google
        </button>

        <div className={styles.separador}><span>o</span></div>

        {enviado ? (
          <div className={styles.enviado}>
            <IconoCheck tam={22} />
            <p>
              Te hemos enviado un enlace a <b>{email}</b>. Ábrelo desde este mismo dispositivo para entrar.
              <br />
              <small>Si no lo ves, mira en la carpeta de spam.</small>
            </p>
          </div>
        ) : (
          <form onSubmit={conEmail} className={styles.formEmail}>
            <label className={styles.cajaIcono}>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="tu@email.com"
                aria-label="Tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.caja}
              />
            </label>
            <button type="submit" className={styles.boton} disabled={ocupado}>
              {ocupado ? "Enviando…" : "Enviarme un enlace"}
            </button>
          </form>
        )}
      </div>

      <ul className={styles.notas} style={{ marginTop: 22 }}>
        <li><IconoInfo tam={18} /> Sin contraseñas: entras con Google o con un enlace que te llega al email.</li>
        <li><IconoCheck tam={18} /> Solo guardamos tu email y tu nombre. Nunca tu ubicación.</li>
      </ul>
    </>
  );
}
