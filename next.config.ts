import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents / partialPrefetching desactivados: hacen que las páginas se cuelguen
  // en Cloudflare Workers con @opennextjs/cloudflare.
};

export default nextConfig;
