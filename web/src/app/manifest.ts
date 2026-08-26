import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recuerdos",
    short_name: "Recuerdos",
    description:
      "Vincula recuerdos digitales a objetos fisicos y encuentralos apuntando con la camara.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fcfbfa",
    theme_color: "#fcfbfa",
    lang: "es",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
