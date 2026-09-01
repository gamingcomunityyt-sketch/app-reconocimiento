import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jimp (reconocimiento local) usa APIs de Node; que no se empaquete.
  serverExternalPackages: ["jimp"],
  async rewrites() {
    const visionDev = process.env.VISION_API_URL?.trim();
    if (!visionDev) return [];
    const base = visionDev.replace(/\/$/, "");
    return [
      {
        source: "/api/vision/:path*",
        destination: `${base}/api/vision/:path*`,
      },
    ];
  },
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
