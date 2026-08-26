/**
 * Recuerdos de ejemplo.
 *
 * Existen para poder ver, tocar y juzgar la interfaz antes de que haya base de
 * datos. Se sustituyen por consultas a Supabase en la fase 1 del plan de
 * migracion sin tocar ninguna pantalla.
 *
 * Las fotografias vienen de picsum.photos, que sirve fotografia real de forma
 * determinista a partir de una semilla. El contenido de cada foto no se
 * corresponde con el titulo del recuerdo: son datos de ejemplo, no maquetas
 * definitivas.
 */

import type { MemoryDetail } from "./types";

/** Genera una URL estable para una semilla y un tamano dados. */
function photo(seed: string, width: number, height: number): string {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

const COVER_WIDTH = 900;
const COVER_HEIGHT = 1200;

function cover(seed: string): string {
  return photo(seed, COVER_WIDTH, COVER_HEIGHT);
}

function gallery(seed: string): string {
  return photo(seed, 1200, 900);
}

function objectPhoto(seed: string): string {
  return photo(seed, 600, 600);
}

const MINUTE = 60_000;

export const SAMPLE_MEMORIES: MemoryDetail[] = [
  {
    id: "lisboa-2024",
    title: "Cuatro dias en Lisboa",
    happenedAt: "2024-05-18",
    location: "Lisboa, Portugal",
    description:
      "Nos perdimos buscando el mirador y acabamos encontrando la mejor terraza del viaje. Volvimos tres tardes seguidas.",
    coverUrl: cover("lisboa-cover"),
    coverAlt: "Calle empinada con tranvia al fondo",
    mediaCount: 5,
    hasLinkedObject: true,
    isShared: true,
    media: [
      {
        id: "lisboa-m1",
        kind: "image",
        previewUrl: gallery("lisboa-1"),
        alt: "Tranvia amarillo subiendo una calle estrecha",
        durationMs: null,
        caption: "El 28 a primera hora, antes de las colas",
      },
      {
        id: "lisboa-m2",
        kind: "image",
        previewUrl: gallery("lisboa-2"),
        alt: "Tejados de la ciudad desde un mirador",
        durationMs: null,
        caption: null,
      },
      {
        id: "lisboa-m3",
        kind: "video",
        previewUrl: gallery("lisboa-3"),
        alt: "Musico callejero tocando en una plaza",
        durationMs: 47_000,
        caption: "El fado que sonaba en la plaza",
      },
      {
        id: "lisboa-m4",
        kind: "image",
        previewUrl: gallery("lisboa-4"),
        alt: "Mesa de terraza con dos cafes",
        durationMs: null,
        caption: null,
      },
      {
        id: "lisboa-m5",
        kind: "image",
        previewUrl: gallery("lisboa-5"),
        alt: "Azulejos azules en la fachada de un edificio",
        durationMs: null,
        caption: null,
      },
    ],
    objects: [
      {
        id: "lisboa-iman",
        label: "Iman de la nevera",
        imageUrl: objectPhoto("lisboa-obj"),
        referenceCount: 3,
      },
    ],
    members: [
      { id: "u-yo", name: "Aaron", role: "owner" },
      { id: "u-marta", name: "Marta", role: "editor" },
    ],
  },
  {
    id: "vetusta-2023",
    title: "El concierto de Vetusta Morla",
    happenedAt: "2023-11-04",
    location: "Madrid",
    description:
      "Segunda fila. Nos quedamos sin voz para el tercer tema y aun asi aguantamos hasta el final.",
    coverUrl: cover("concierto-cover"),
    coverAlt: "Escenario iluminado visto desde el publico",
    mediaCount: 4,
    hasLinkedObject: true,
    isShared: false,
    media: [
      {
        id: "vm-m1",
        kind: "image",
        previewUrl: gallery("concierto-1"),
        alt: "Focos de colores sobre el escenario",
        durationMs: null,
        caption: null,
      },
      {
        id: "vm-m2",
        kind: "video",
        previewUrl: gallery("concierto-2"),
        alt: "Publico con los brazos en alto",
        durationMs: 92_000,
        caption: "Los ultimos dos minutos, con todo el mundo cantando",
      },
      {
        id: "vm-m3",
        kind: "image",
        previewUrl: gallery("concierto-3"),
        alt: "Entrada de papel arrugada sobre una mesa",
        durationMs: null,
        caption: null,
      },
      {
        id: "vm-m4",
        kind: "image",
        previewUrl: gallery("concierto-4"),
        alt: "Salida del recinto de noche",
        durationMs: null,
        caption: null,
      },
    ],
    objects: [
      {
        id: "vm-entrada",
        label: "La entrada",
        imageUrl: objectPhoto("concierto-obj"),
        referenceCount: 1,
      },
    ],
    members: [{ id: "u-yo", name: "Aaron", role: "owner" }],
  },
  {
    id: "reloj-abuelo",
    title: "El reloj del abuelo Emilio",
    happenedAt: "1998-06-12",
    location: "Valencia",
    description:
      "Lo llevaba puesto todos los domingos. Grabe a la abuela contando de donde venia antes de que se le olvidara.",
    coverUrl: cover("reloj-cover"),
    coverAlt: "Reloj de pulsera antiguo sobre madera",
    mediaCount: 4,
    hasLinkedObject: true,
    isShared: true,
    media: [
      {
        id: "reloj-m1",
        kind: "image",
        previewUrl: gallery("reloj-1"),
        alt: "Detalle de la esfera del reloj",
        durationMs: null,
        caption: null,
      },
      {
        id: "reloj-m2",
        kind: "audio",
        previewUrl: null,
        alt: "Grabacion de la abuela contando la historia del reloj",
        durationMs: 4 * MINUTE + 12_000,
        caption: "La abuela contando de donde vino el reloj",
      },
      {
        id: "reloj-m3",
        kind: "image",
        previewUrl: gallery("reloj-2"),
        alt: "Fotografia antigua en blanco y negro de un hombre joven",
        durationMs: null,
        caption: "El abuelo el dia que se lo regalaron",
      },
      {
        id: "reloj-m4",
        kind: "audio",
        previewUrl: null,
        alt: "Grabacion del sonido del mecanismo",
        durationMs: 38_000,
        caption: "Todavia suena",
      },
    ],
    objects: [
      {
        id: "reloj-obj",
        label: "El reloj",
        imageUrl: objectPhoto("reloj-obj"),
        referenceCount: 4,
      },
    ],
    members: [
      { id: "u-yo", name: "Aaron", role: "owner" },
      { id: "u-lucia", name: "Lucia", role: "viewer" },
      { id: "u-pablo", name: "Pablo", role: "viewer" },
    ],
  },
  {
    id: "dragon-mateo",
    title: "El dragon de Mateo",
    happenedAt: "2025-02-09",
    location: null,
    description:
      "Tardo toda una tarde y me explico que el dragon era bueno pero le habian dado mal la merienda.",
    coverUrl: cover("dibujo-cover"),
    coverAlt: "Dibujo infantil con ceras de colores",
    mediaCount: 2,
    hasLinkedObject: true,
    isShared: false,
    media: [
      {
        id: "dragon-m1",
        kind: "image",
        previewUrl: gallery("dibujo-1"),
        alt: "Dibujo a ceras de un dragon verde",
        durationMs: null,
        caption: null,
      },
      {
        id: "dragon-m2",
        kind: "audio",
        previewUrl: null,
        alt: "Mateo explicando su dibujo",
        durationMs: 71_000,
        caption: "Mateo explicando quien es quien",
      },
    ],
    objects: [
      {
        id: "dragon-obj",
        label: "El dibujo original",
        imageUrl: objectPhoto("dibujo-obj"),
        referenceCount: 1,
      },
    ],
    members: [{ id: "u-yo", name: "Aaron", role: "owner" }],
  },
  {
    id: "cadaques-2023",
    title: "Verano en Cadaques",
    happenedAt: "2023-08-11",
    location: "Cadaques, Girona",
    description: "Diez dias sin planes. El mejor verano en mucho tiempo.",
    coverUrl: cover("cadaques-cover"),
    coverAlt: "Cala de agua transparente entre rocas",
    mediaCount: 7,
    hasLinkedObject: false,
    isShared: true,
    media: [
      {
        id: "cad-m1",
        kind: "image",
        previewUrl: gallery("cadaques-1"),
        alt: "Barca de madera amarrada en una cala",
        durationMs: null,
        caption: null,
      },
      {
        id: "cad-m2",
        kind: "image",
        previewUrl: gallery("cadaques-2"),
        alt: "Casas blancas junto al mar",
        durationMs: null,
        caption: null,
      },
      {
        id: "cad-m3",
        kind: "image",
        previewUrl: gallery("cadaques-3"),
        alt: "Atardecer sobre el agua",
        durationMs: null,
        caption: "La ultima noche",
      },
      {
        id: "cad-m4",
        kind: "video",
        previewUrl: gallery("cadaques-4"),
        alt: "Olas rompiendo contra las rocas",
        durationMs: 24_000,
        caption: null,
      },
      {
        id: "cad-m5",
        kind: "image",
        previewUrl: gallery("cadaques-5"),
        alt: "Mesa con restos de una comida al aire libre",
        durationMs: null,
        caption: null,
      },
      {
        id: "cad-m6",
        kind: "image",
        previewUrl: gallery("cadaques-6"),
        alt: "Camino de tierra entre olivos",
        durationMs: null,
        caption: null,
      },
      {
        id: "cad-m7",
        kind: "image",
        previewUrl: gallery("cadaques-7"),
        alt: "Sombrilla de rayas en la playa",
        durationMs: null,
        caption: null,
      },
    ],
    objects: [],
    members: [
      { id: "u-yo", name: "Aaron", role: "owner" },
      { id: "u-marta", name: "Marta", role: "editor" },
    ],
  },
  {
    id: "boda-marta",
    title: "La boda de Marta y Carlos",
    happenedAt: "2024-07-20",
    location: "Begur, Girona",
    description: "El discurso de su padre nos dejo a todos callados.",
    coverUrl: cover("boda-cover"),
    coverAlt: "Mesa larga decorada al aire libre al atardecer",
    mediaCount: 6,
    hasLinkedObject: false,
    isShared: true,
    media: [
      {
        id: "boda-m1",
        kind: "image",
        previewUrl: gallery("boda-1"),
        alt: "Guirnalda de luces sobre una mesa larga",
        durationMs: null,
        caption: null,
      },
      {
        id: "boda-m2",
        kind: "image",
        previewUrl: gallery("boda-2"),
        alt: "Ramo de flores sobre una silla",
        durationMs: null,
        caption: null,
      },
      {
        id: "boda-m3",
        kind: "video",
        previewUrl: gallery("boda-3"),
        alt: "Primer baile en la pista",
        durationMs: 133_000,
        caption: "El primer baile",
      },
      {
        id: "boda-m4",
        kind: "image",
        previewUrl: gallery("boda-4"),
        alt: "Invitados brindando",
        durationMs: null,
        caption: null,
      },
      {
        id: "boda-m5",
        kind: "audio",
        previewUrl: null,
        alt: "Discurso del padre de Marta",
        durationMs: 6 * MINUTE + 4_000,
        caption: "El discurso",
      },
      {
        id: "boda-m6",
        kind: "image",
        previewUrl: gallery("boda-5"),
        alt: "Zapatos abandonados junto a la pista de baile",
        durationMs: null,
        caption: null,
      },
    ],
    members: [
      { id: "u-yo", name: "Aaron", role: "viewer" },
      { id: "u-marta", name: "Marta", role: "owner" },
      { id: "u-carlos", name: "Carlos", role: "owner" },
    ],
    objects: [],
  },
  {
    id: "primera-casa",
    title: "Nuestra primera casa",
    happenedAt: "2022-09-01",
    location: "Zaragoza",
    description:
      "Dormimos en el suelo la primera noche porque la cama llego tres dias tarde.",
    coverUrl: cover("casa-cover"),
    coverAlt: "Habitacion vacia con cajas de mudanza",
    mediaCount: 3,
    hasLinkedObject: true,
    isShared: false,
    media: [
      {
        id: "casa-m1",
        kind: "image",
        previewUrl: gallery("casa-1"),
        alt: "Cajas de carton apiladas junto a una ventana",
        durationMs: null,
        caption: null,
      },
      {
        id: "casa-m2",
        kind: "image",
        previewUrl: gallery("casa-2"),
        alt: "Manos sosteniendo un juego de llaves",
        durationMs: null,
        caption: "Las llaves, el primer dia",
      },
      {
        id: "casa-m3",
        kind: "image",
        previewUrl: gallery("casa-3"),
        alt: "Cena improvisada sentados en el suelo",
        durationMs: null,
        caption: null,
      },
    ],
    objects: [
      {
        id: "casa-llave",
        label: "La llave antigua",
        imageUrl: objectPhoto("casa-obj"),
        referenceCount: 2,
      },
    ],
    members: [{ id: "u-yo", name: "Aaron", role: "owner" }],
  },
  {
    id: "caja-fotos",
    title: "La caja de fotos de mama",
    happenedAt: "2021-12-24",
    location: null,
    description:
      "Estuvimos toda la nochebuena mirandolas y poniendo nombre a gente que ya nadie recordaba.",
    coverUrl: cover("fotos-cover"),
    coverAlt: "Fotografias impresas repartidas sobre una mesa",
    mediaCount: 4,
    hasLinkedObject: true,
    isShared: true,
    media: [
      {
        id: "caja-m1",
        kind: "image",
        previewUrl: gallery("fotos-1"),
        alt: "Fotografias antiguas repartidas sobre un mantel",
        durationMs: null,
        caption: null,
      },
      {
        id: "caja-m2",
        kind: "image",
        previewUrl: gallery("fotos-2"),
        alt: "Retrato en blanco y negro de una mujer joven",
        durationMs: null,
        caption: "Mama, con veinte anos",
      },
      {
        id: "caja-m3",
        kind: "image",
        previewUrl: gallery("fotos-3"),
        alt: "Reverso de una fotografia con una fecha escrita a mano",
        durationMs: null,
        caption: null,
      },
      {
        id: "caja-m4",
        kind: "audio",
        previewUrl: null,
        alt: "Mama contando quien sale en cada fotografia",
        durationMs: 9 * MINUTE + 27_000,
        caption: "Quien es quien",
      },
    ],
    objects: [
      {
        id: "caja-foto-obj",
        label: "El retrato de mama",
        imageUrl: objectPhoto("fotos-obj"),
        referenceCount: 1,
      },
    ],
    members: [
      { id: "u-yo", name: "Aaron", role: "owner" },
      { id: "u-lucia", name: "Lucia", role: "editor" },
    ],
  },
];
