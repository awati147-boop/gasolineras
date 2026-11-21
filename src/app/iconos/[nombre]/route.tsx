import { icono } from "@/lib/icono";

// /iconos/192.png, /iconos/512.png y /iconos/512-maskable.png para el manifiesto de la PWA
export async function GET(_req: Request, { params }: { params: Promise<{ nombre: string }> }) {
  const { nombre } = await params;
  const m = /^(192|512)(-maskable)?\.png$/.exec(nombre);
  if (!m) return new Response("No encontrado", { status: 404 });
  return icono(Number(m[1]), Boolean(m[2]));
}
