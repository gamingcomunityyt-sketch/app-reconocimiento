import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * El reconocimiento ahora corre localmente (sin Render), asi que no hay nada
 * que "despertar". Se mantiene el endpoint para no romper la llamada del
 * cliente al abrir el escaner.
 */
export async function POST() {
  return NextResponse.json({ warmed: true, local: true });
}
