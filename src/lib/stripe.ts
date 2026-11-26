// Cliente mínimo de la API de Stripe (solo servidor). Sin dependencias: funciona igual en Cloudflare Workers y en Node.
// La clave secreta (sk_test_… / sk_live_…) solo existe en el servidor (variable STRIPE_SECRET_KEY).

/** Versiones de la API fijadas para que los cambios de Stripe no cambien las respuestas sin avisar */
export const VERSION_API = "2025-03-31.basil"; // /v1 (pagos, devoluciones, transferencias)
export const VERSION_API_V2 = "2026-11-18.endive"; // /v2 (cuentas de cobro de los dueños: Accounts v2)

type Valor = string | number | boolean | null | undefined | Valor[] | { [k: string]: Valor };
export type Parametros = { [k: string]: Valor };

export class ErrorStripe extends Error {
  estado: number;
  codigo: string | undefined;
  constructor(estado: number, codigo: string | undefined, mensaje: string) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

/** Codifica objetos anidados como los quiere Stripe: a[b][0][c]=valor */
export function codificar(obj: Parametros, prefijo = "", salida = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (x !== null && typeof x === "object") codificar(x as Parametros, `${clave}[${i}]`, salida);
        else if (x !== undefined && x !== null) salida.append(`${clave}[${i}]`, String(x));
      });
    } else if (typeof v === "object") {
      codificar(v as Parametros, clave, salida);
    } else {
      salida.append(clave, String(v));
    }
  }
  return salida;
}

export type LlamarStripe = <T = Record<string, unknown>>(
  metodo: "GET" | "POST",
  ruta: string,
  parametros?: Parametros,
  idempotencia?: string,
) => Promise<T>;

/**
 * Crea la función para llamar a Stripe. `base` solo se cambia en las pruebas (servidor falso).
 * Las rutas /v1 van como formulario; las /v2 (cuentas de cobro) van en JSON con su propia versión.
 */
export function crearStripe(clave: string, base = "https://api.stripe.com"): LlamarStripe {
  return async function stripe<T>(metodo: "GET" | "POST", ruta: string, parametros?: Parametros, idempotencia?: string) {
    const v2 = ruta.startsWith("/v2/");
    const query = parametros && (metodo === "GET" || !v2) ? codificar(parametros).toString() : "";
    const url = `${base}${ruta}${metodo === "GET" && query ? `?${query}` : ""}`;
    const cuerpo = metodo === "POST" ? (v2 ? JSON.stringify(parametros ?? {}) : query) : undefined;
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${clave}`,
      "Stripe-Version": v2 ? VERSION_API_V2 : VERSION_API,
    };
    if (metodo === "POST") cabeceras["Content-Type"] = v2 ? "application/json" : "application/x-www-form-urlencoded";
    if (idempotencia) cabeceras["Idempotency-Key"] = idempotencia;

    // Un reintento si la red falla o Stripe responde 5xx/429 (con la misma clave de idempotencia es seguro)
    for (let intento = 0; ; intento++) {
      let res: Response;
      try {
        res = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo });
      } catch (e) {
        if (intento < 1) continue;
        throw new ErrorStripe(0, "red", `Sin conexión con el proveedor de pagos: ${(e as Error).message}`);
      }
      if ((res.status >= 500 || res.status === 429) && intento < 1) {
        await new Promise((ok) => setTimeout(ok, 500));
        continue;
      }
      const datos = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      if (!res.ok) {
        throw new ErrorStripe(res.status, datos.error?.code, datos.error?.message ?? `Error ${res.status} del proveedor de pagos`);
      }
      return datos as T;
    }
  };
}

/** ¿La clave es de modo real (dinero de verdad) o de prueba? */
export const claveReal = (clave: string) => /^(sk|rk)_live_/.test(clave);

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Comparación en tiempo constante (para no dar pistas de la firma correcta) */
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Comprueba la cabecera Stripe-Signature ("t=…,v1=…") de un aviso (webhook).
 * Firma = HMAC-SHA256(secreto, `${t}.${cuerpo}`). Se rechaza si tiene más de `toleranciaS` segundos.
 */
export async function firmaValida(cuerpo: string, cabecera: string | null, secreto: string, toleranciaS = 300, ahora = Date.now()) {
  if (!cabecera || !secreto) return false;
  const partes = cabecera.split(",").map((p) => p.trim().split("="));
  const t = partes.find(([k]) => k === "t")?.[1];
  const firmas = partes.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !/^\d+$/.test(t) || !firmas.length) return false;
  if (Math.abs(ahora / 1000 - Number(t)) > toleranciaS) return false;
  const codif = new TextEncoder();
  const clave = await crypto.subtle.importKey("raw", codif.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperada = hex(await crypto.subtle.sign("HMAC", clave, codif.encode(`${t}.${cuerpo}`)));
  return firmas.some((f) => iguales(f, esperada));
}
