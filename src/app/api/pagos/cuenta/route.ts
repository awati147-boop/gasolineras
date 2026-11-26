import { NextRequest, NextResponse } from "next/server";
import { cuerpoJson, dependencias, emailDelToken, respuestaError, tokenDe } from "@/lib/pagosApi";
import { ErrorPagos, enlaceAltaCuenta, enlacePanelCuenta, estadoCuenta } from "@/lib/pagosServidor";

/** GET /api/pagos/cuenta — estado de la cuenta de cobro del usuario */
export async function GET(req: NextRequest) {
  try {
    const token = tokenDe(req);
    if (!token) throw new ErrorPagos(401, "Tienes que entrar en tu cuenta.");
    return NextResponse.json(await estadoCuenta(dependencias(token)));
  } catch (e) {
    return respuestaError(e);
  }
}

/** POST /api/pagos/cuenta {accion: "alta" | "panel"} — enlace a la página segura del proveedor de pagos */
export async function POST(req: NextRequest) {
  try {
    const token = tokenDe(req);
    if (!token) throw new ErrorPagos(401, "Tienes que entrar en tu cuenta.");
    const { accion } = await cuerpoJson(req);
    const d = dependencias(token);
    if (accion === "alta") return NextResponse.json({ url: await enlaceAltaCuenta(d, req.nextUrl.origin, emailDelToken(token)) });
    if (accion === "panel") return NextResponse.json({ url: await enlacePanelCuenta(d, req.nextUrl.origin) });
    throw new ErrorPagos(400, "Acción desconocida.");
  } catch (e) {
    return respuestaError(e);
  }
}
