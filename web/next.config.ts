import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Detecta la perdida de conexion y reintenta sola la navegacion que se
     * quedo bloqueada. En un movil con cobertura irregular es la diferencia
     * entre una pantalla en blanco y que el contenido llegue al recuperarla.
     */
    useOffline: true,
  },
  images: {
    /**
     * Las fotografias de ejemplo se sirven desde picsum.photos mientras la capa
     * de datos no consulta Supabase. Las firmadas de Storage van sin optimizar.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
};

export default nextConfig;
