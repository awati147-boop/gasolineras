// Estilo de mapa común (teselas de OpenStreetMap) para todas las pantallas
export const ESTILO_MAPA = {
  version: 8 as const,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

// El worker de MapLibre se sirve desde /public (lo copia "npm install" con el script postinstall)
export const URL_WORKER_MAPA = "/maplibre-gl-worker.mjs";
