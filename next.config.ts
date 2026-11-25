import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents / partialPrefetching desactivados: hacen que las páginas se cuelguen
  // en Cloudflare Workers con @opennextjs/cloudflare.

  // Raíz = esta carpeta. Sin esto, un package-lock.json suelto en la carpeta de usuario hace que
  // Turbopack vigile toda esa carpeta y la página se recargue sin parar en local.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
