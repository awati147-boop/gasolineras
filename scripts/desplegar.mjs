// Despliegue a Cloudflare SIN secretos dentro del código.
// El adaptador (@opennextjs/cloudflare) copia los valores de los archivos .env* al código del Worker
// (.open-next/cloudflare/next-env.mjs). .env.local tiene claves secretas (Supabase, Stripe…), así que se aparta
// mientras se compila y después se comprueba que no se ha colado ninguna. Si se cuela, no se sube nada.
// Las variables de la web publicada se ponen en Cloudflare (Worker → Settings → Variables and Secrets).
// Uso: npm run deploy  (o: node scripts/desplegar.mjs --solo-compilar)
import { execSync } from "node:child_process";
import fs from "node:fs";

const ARCHIVOS = [
  ".env", ".env.local",
  ".env.production", ".env.production.local",
  ".env.development", ".env.development.local",
  ".env.test", ".env.test.local",
];
const SUFIJO = ".apartado";
const PROHIBIDAS = /SECRET|SERVICE_ROLE|PRIVATE|STRIPE|PAGOS|PASSWORD|TOKEN/i;

// Si una ejecución anterior se cortó a medias, devolver primero los archivos a su sitio
for (const f of ARCHIVOS) {
  if (fs.existsSync(f + SUFIJO) && !fs.existsSync(f)) fs.renameSync(f + SUFIJO, f);
}

const apartados = [];
try {
  for (const f of ARCHIVOS) {
    if (fs.existsSync(f)) {
      fs.renameSync(f, f + SUFIJO);
      apartados.push(f);
    }
  }
  execSync("npx opennextjs-cloudflare build", { stdio: "inherit" });
} finally {
  for (const f of apartados) fs.renameSync(f + SUFIJO, f);
}

const env = fs.readFileSync(".open-next/cloudflare/next-env.mjs", "utf8");
const claves = [...new Set([...env.matchAll(/"([A-Za-z0-9_]+)":/g)].map((m) => m[1]))];
const malas = claves.filter((k) => PROHIBIDAS.test(k));
if (malas.length) {
  console.error(`\n❌ Se han colado claves en el código (${malas.join(", ")}). No se sube nada.`);
  process.exit(1);
}
console.log(`\n✔ Sin claves dentro del código (${claves.length ? claves.join(", ") : "ninguna variable de archivos .env"}).`);

if (!process.argv.includes("--solo-compilar")) execSync("npx opennextjs-cloudflare deploy", { stdio: "inherit" });
