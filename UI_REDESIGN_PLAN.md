# Plan de rediseño de interfaz

Estado del documento: plan aprobado, en ejecución.
Fecha: 2026-08-24.
Documento hermano: `MIGRATION_PLAN.md`, que cubre datos, seguridad y reconocimiento.

---

## 1. Punto de partida real

Conviene decirlo con claridad porque cambia la naturaleza del trabajo: **no hay
una interfaz que rediseñar**. La aplicación Next.js de `web/` es todavía el
esqueleto recién creado.

| Ruta existente | Contenido |
| --- | --- |
| `/` | Una página de texto que anuncia "Fase 0 completada" |

Además existen `layout.tsx` con las fuentes y el viewport, `globals.css` con los
cuatro tokens por defecto de `create-next-app`, la validación de variables de
entorno y los tipos del dominio. No hay componentes, ni navegación, ni pantallas.

La única interfaz que existe de verdad es la prueba de concepto en Streamlit
(`app.py`, líneas 332–598): dos pestañas, una barra lateral con siete
deslizadores de parámetros, una tabla de ranking y un panel de diagnóstico de
correspondencias. `MIGRATION_PLAN.md` §3.2 ya decidió que esa capa se elimina
completa, y este plan no la conserva en ninguna forma.

Consecuencia práctica: este documento no describe una reforma sino la
**especificación de las pantallas que se construyen por primera vez**. No hay
código visual heredado que desmontar, ni navegación previa que respetar, ni
inconsistencias acumuladas. Es la situación más favorable posible para aplicar el
brief entero sin concesiones.

### 1.1 Problemas del diseño actual que aun así hay que registrar

Aunque la interfaz Streamlit se descarte, sus defectos son lecciones que el nuevo
diseño debe evitar de forma explícita:

1. **La interfaz expone el algoritmo.** `MATCH` en letras enormes, "Índice de
   similitud: 78.3", inliers, ratio de inliers, keypoints, y un panel de líneas
   verdes. Todo eso pertenece al sistema. El usuario quiere su recuerdo.
2. **El usuario ajusta los umbrales de decisión.** Siete deslizadores deciden el
   veredicto. Desaparecen: pasan a constantes de servidor.
3. **El flujo es un formulario, no una experiencia.** Subir referencias, elegir
   origen, subir escaneo, esperar, leer una tabla. El brief pide exactamente lo
   contrario para Escanear.
4. **No hay concepto de recuerdo.** Solo hay imágenes de referencia con nombre de
   archivo. El producto va de recuerdos, no de ficheros.
5. **Nada es navegable.** Dos pestañas y una barra lateral no son una aplicación
   móvil.

### 1.2 Qué se conserva del trabajo previo

- Los tipos del dominio de `web/src/types/domain.ts`: son la forma de los datos
  que consumen las pantallas y no cambian.
- La validación de variables de entorno de `web/src/lib/env.ts`.
- El `viewport` con `viewportFit: "cover"`, ya previsto para que la cámara ocupe
  la pantalla completa incluida el área del notch.
- El idioma `es` del documento y la fuente Geist, que es moderna, legible y
  discreta: no hace falta añadir otra tipografía.
- Del núcleo de visión (`app.py` líneas 29–325) no se toca nada. Este plan es
  solo interfaz.

---

## 2. Decisiones de producto tomadas

Registradas aquí para que queden documentadas y sean reversibles.

| Decisión | Elección | Motivo |
| --- | --- | --- |
| Idioma de la interfaz | Español en todo | Público objetivo inicial. La navegación es Recuerdos / Escanear / Perfil, no Memories / Scan / Profile |
| Orden de trabajo | Interfaz completa primero, con datos de ejemplo | Permite ver y probar el producto en el móvil ya, en lugar de esperar a que esté la base de datos |
| Alcance de esta versión | Biblioteca, detalle, creación, vinculación de objeto y escaneo | Es el circuito completo del producto. Compartir y ajustes avanzados quedan para después |
| Origen de los datos | Capa de ejemplo aislada detrás de una interfaz | Cuando exista el proyecto de Supabase se sustituye esa capa sin tocar ninguna pantalla |

### 2.1 Sobre los datos de ejemplo

Las pantallas leen de `src/lib/data/`, que expone funciones como
`listMemories()` y `getMemory(id)`. Hoy devuelven recuerdos de ejemplo; mañana
consultan Supabase. Ninguna pantalla sabe de dónde vienen los datos, así que el
cambio no toca la interfaz.

Esto significa que en esta fase **no se guarda nada de verdad**: crear un
recuerdo lo añade a la sesión del navegador y se pierde al recargar. Es
intencional y temporal, y la interfaz no miente al usuario sobre ello.

---

## 3. Nueva arquitectura de pantallas

Cinco pantallas. Ni una más.

```
/                          Biblioteca — la pantalla principal
/recuerdo/[id]             Detalle del recuerdo — inmersivo
/crear                     Creación progresiva — pantalla completa
/escanear                  Cámara de escaneo — pantalla completa
/perfil                    Perfil y ajustes
```

Traducido a ficheros, usando un grupo de rutas para separar lo que lleva
navegación inferior de lo que no:

```
src/app/
  layout.tsx                    fuentes, tema, metadatos, viewport
  globals.css                   tokens del sistema de diseño + view transitions
  manifest.ts                   PWA
  (shell)/                      pantallas con navegación inferior
    layout.tsx                  AppNavigation
    page.tsx                    Biblioteca
    loading.tsx                 skeleton de la biblioteca
    perfil/page.tsx             Perfil
  recuerdo/[id]/
    page.tsx                    Detalle
    loading.tsx                 skeleton del detalle
    not-found.tsx
  crear/page.tsx                Creación
  escanear/page.tsx             Escaneo
```

El detalle, la creación y el escaneo se salen del grupo `(shell)` a propósito:
las tres son experiencias inmersivas donde la navegación inferior estorbaría. El
brief lo pide de forma explícita para el detalle ("la interfaz debe desaparecer
todo lo posible") y para el escaneo ("evita overlays enormes").

### 3.1 Qué NO se construye ahora

Compartir, gestión de miembros, almacenamiento, sesiones y dispositivos. La
pantalla de Perfil deja el sitio preparado y visible, pero sin implementar por
dentro. Construir permisos antes de que exista autenticación real sería trabajo
que habría que rehacer.

---

## 4. Navegación

Tres destinos, con Escanear con prioridad visual clara:

```
┌─────────────────────────────────────────┐
│                                         │
│              contenido                  │
│                                         │
├─────────────────────────────────────────┤
│   Recuerdos      ( ◎ )       Perfil     │
└─────────────────────────────────────────┘
                Escanear
```

Decisiones concretas:

- **Barra inferior flotante**, no fija al borde, con `env(safe-area-inset-bottom)`
  para no chocar con el indicador de inicio del iPhone.
- **Escanear es un botón central elevado y en color de acento.** Es la acción
  diferencial del producto y la que debe encontrarse sin pensar.
- **Crear no está en la barra.** Vive como botón flotante en la biblioteca. Poner
  cuatro destinos rompería la simetría del botón central, y crear es una acción,
  no un lugar.
- **Objetivos táctiles de 44 px mínimo** en los tres destinos.
- La barra **desaparece** en detalle, creación y escaneo.
- En escritorio la barra se mantiene abajo y centrada, sin convertirse en sidebar.
  El brief prohíbe explícitamente el sidebar enorme, y una barra centrada de
  ancho limitado se lee bien en pantalla grande.

---

## 5. Sistema de diseño

Todo en tokens dentro de `globals.css`, con el `@theme` de Tailwind 4. Ningún
valor suelto por componente.

### 5.1 Color

La fotografía aporta el color. La interfaz se aparta.

| Token | Papel |
| --- | --- |
| `--surface` | Fondo de la aplicación |
| `--surface-raised` | Tarjetas, hojas inferiores |
| `--surface-sunken` | Huecos, campos, skeletons |
| `--border` | Separadores, a un solo nivel de contraste |
| `--text` | Texto principal |
| `--text-muted` | Fechas, ubicaciones, texto secundario |
| `--text-subtle` | Texto terciario, marcas de agua |
| `--accent` | Un único color reconocible |
| `--accent-contrast` | Texto sobre el acento |
| `--danger`, `--warning`, `--success` | Solo estados semánticos |

El acento es un **ámbar terroso apagado**. Es cálido, lo que acompaña a recuerdo
e intimidad, pero desaturado, lo que evita lo cursi. Un azul corporativo
convertiría el producto en una herramienta; un rosa o un morado lo volverían
sentimental.

Modo claro y modo oscuro con los mismos tokens y contraste verificado. El modo
oscuro no es gris azulado sino cálido y neutro, para que las fotografías no se
vean frías.

### 5.2 Tipografía

Geist, ya instalada. Jerarquía por tamaño, peso y espacio, nunca por color.

| Token | Uso |
| --- | --- |
| `--text-display` | Título de pantalla, 28–32 px, peso 600, tracking negativo |
| `--text-title` | Títulos de recuerdo |
| `--text-body` | Descripciones |
| `--text-label` | Etiquetas de interfaz |
| `--text-meta` | Fecha, ubicación, 13 px, `--text-muted` |

### 5.3 Espaciado, radios, sombras

- Espaciado en múltiplos de 4, usando la escala de Tailwind sin inventar valores.
- Radios: `--radius-sm` 10 px para controles, `--radius-md` 16 px para tarjetas,
  `--radius-lg` 24 px para hojas inferiores, `--radius-full` para pastillas.
- Sombras: **dos niveles y ya**. Una para elevación de tarjeta y otra para
  elementos flotantes. El brief prohíbe bordes alrededor de todo, así que la
  separación se consigue con superficie y sombra, no con líneas.

### 5.4 Movimiento

| Token | Valor | Uso |
| --- | --- | --- |
| `--motion-fast` | 150 ms | Estados pressed, apariciones pequeñas |
| `--motion-base` | 220 ms | Transiciones normales |
| `--motion-slow` | 400 ms | Morfología de imagen compartida |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Entradas |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Movimientos |

`prefers-reduced-motion` anula todas las duraciones. No es una casilla de
accesibilidad: hay gente a la que el movimiento le produce náuseas.

### 5.5 Iconos

**Lucide, y solo Lucide.** Ni un emoji, ni un SVG suelto, ni una imagen para
representar una acción. La prueba de concepto usaba 🔍 en el título; eso
desaparece.

---

## 6. Componentes

Reutilizables donde aporta, sin capas de abstracción inventadas.

| Componente | Responsabilidad |
| --- | --- |
| `AppNavigation` | Barra inferior con Escanear destacado |
| `MemoryCard` | Fotografía protagonista, título discreto, fecha, indicadores |
| `MemoryGrid` | Rejilla responsive de recuerdos |
| `MemorySearch` | Búsqueda, sin filtros mientras no sean necesarios |
| `MediaGallery` | Fotos, vídeos y audios del detalle |
| `AudioNote` | Reproductor mínimo para audios |
| `ObjectCard` | Objeto físico vinculado, con su fotografía |
| `MemberAvatar` | Persona con acceso |
| `EmptyState` | Estado vacío ilustrado, sin muro de texto |
| `SkeletonCard` | Carga de la rejilla |
| `BottomSheet` | Hoja inferior con arrastre para cerrar |
| `Button`, `IconButton` | Controles, con estados pressed y focus |
| `ScanCamera` | Cámara a pantalla completa |
| `RecognitionOverlay` | Área de detección y feedback de análisis |
| `ScanResult` | Los tres desenlaces del escaneo |
| `CreateFlow` | Creación progresiva paso a paso |
| `LinkObjectStep` | Captura de las vistas del objeto |

### 6.1 Indicadores en `MemoryCard`

El brief pide "pequeños indicadores" de contenido compartido y objetos
vinculados. Se resuelven con dos iconos discretos sobre la fotografía, no con
etiquetas de texto ni con contadores. Si un recuerdo tiene objeto vinculado se
muestra un icono de escaneo, que además enseña la conexión física-digital sin
explicarla.

---

## 7. Flujos

### 7.1 Crear un recuerdo

Progresivo, con lo secundario oculto hasta que se pida.

```
Crear
 ↓
Foto o vídeo principal          ← cámara o galería, un solo toque
 ↓
Título                          ← único campo obligatorio
 ↓
[Añadir más contenido]          opcional
[Vincular un objeto]            opcional
[Fecha · Ubicación · Descripción]  progressive disclosure
 ↓
Guardar
```

Con una foto y un título el recuerdo se guarda. Nada más es obligatorio. El botón
de guardar está activo desde que hay foto y título, y no se esconde detrás de
pasos.

### 7.2 Vincular un objeto físico

Lo importante aquí es que el usuario entienda **para qué sirve**, y eso se explica
visualmente, no con un párrafo:

```
Vincular objeto
 ↓
Cámara con marco de encuadre
 ↓
Captura
 ↓
¿Objeto con volumen? → pedir vista izquierda y derecha
¿Foto, entrada o dibujo? → una captura basta
 ↓
Confirmación que muestra: "Apunta a esto para volver aquí"
```

La confirmación es la pieza clave del producto: enseña la miniatura del objeto
junto a la del recuerdo, unidas. Eso comunica el concepto entero sin tutorial.

Aquí hay una restricción técnica real que la interfaz debe tratar con cuidado:
los objetos lisos y sin textura no se pueden reconocer, es un límite físico del
método (`MIGRATION_PLAN.md` §4.1). Cuando llegue la integración real, si una
captura tiene pocos puntos característicos hay que decirlo **en el momento de
registrarla**, en lenguaje humano ("Este objeto tiene poca textura para
reconocerlo bien; prueba con otra cara o con más luz"), nunca con un número.

### 7.3 Escanear

La experiencia más cuidada, y la que justifica el producto.

```
Toque en Escanear
 ↓
Cámara visible                  ← inmediata, sin pantalla intermedia
 ↓
Apuntar                         ← marco sutil, sin overlay enorme
 ↓
Analizando                      ← pulso ligero, sin spinner bloqueante
 ↓
┌── Reconocido ──────→ miniatura + nombre → transición al recuerdo
├── Ambiguo ────────→ "¿Es uno de estos?" con 2-3 fotografías
└── No reconocido ──→ "Prueba acercándote o cambiando el ángulo"
                       [Reintentar] [Elegir a mano]
```

Sin ventana emergente de "¡Éxito!". Sin puntuaciones. Sin nombres de algoritmo.
El objeto reconocido se convierte visualmente en el recuerdo, y ese morphing es
el feedback.

Vibración corta en el reconocimiento, si el dispositivo la soporta.

---

## 8. Animaciones

Decisión técnica, explicada porque afecta al resultado: **se usa el sistema de
transiciones que ya trae esta versión de Next.js y React, no una librería de
animación para la navegación.**

En términos prácticos: la miniatura de una fotografía en la rejilla se convierte
en la imagen grande del detalle, el navegador se encarga de la animación, y eso
no añade ni un kilobyte de descarga al móvil. Una librería para lo mismo pesaría
bastante y haría el primer arranque más lento, que es justo lo que no queremos en
un producto que se usa desde el teléfono con datos móviles.

Se añade `motion` solo para dos cosas donde el navegador no llega: arrastrar la
hoja inferior para cerrarla, y el pulso del overlay de escaneo. Hacer gestos de
arrastre a mano sale mal.

| Qué | Cómo | Duración |
| --- | --- | --- |
| Recuerdo de la rejilla → detalle | Morfología de elemento compartido | 400 ms |
| Navegación hacia dentro / hacia atrás | Deslizamiento direccional | 150 ms salida, 210 ms entrada |
| Skeleton → contenido | Relevo con Suspense | 150 / 210 ms |
| Hojas inferiores | `motion`, con arrastre | 220 ms |
| Pasos de la creación | Fundido cruzado | 220 ms |
| Objeto reconocido → recuerdo | Morfología compartida | 400 ms |
| Estados pressed | Escala 0.97 | 150 ms |

La cabecera se ancla durante los deslizamientos para que el usuario tenga un
punto de referencia fijo. El overlay de transición no captura clics, para que la
aplicación siga respondiendo mientras anima.

Nada de elementos flotando sin motivo, ni animaciones decorativas en bucle, ni
esperas de un segundo para acciones normales.

---

## 9. Rendimiento

- `next/image` en todas las fotografías, con `sizes` correcto para que el móvil
  no descargue la versión de escritorio.
- Miniaturas en la rejilla, nunca la imagen completa.
- **Los vídeos de la rejilla se muestran como póster**, jamás se cargan. El brief
  lo pide expresamente y es la diferencia entre una rejilla instantánea y una que
  consume la tarifa de datos.
- Skeletons con la forma real del contenido, para que no haya salto de layout.
- Carga diferida de lo que está fuera de pantalla.
- Virtualización solo si llega a hacer falta, no ahora.

---

## 10. Accesibilidad

- Contraste verificado en claro y oscuro.
- Navegación por teclado completa, con `focus-visible` visible de verdad.
- `aria-label` en todo control que solo tenga icono.
- Objetivos táctiles de 44 px.
- `prefers-reduced-motion` respetado en todo el sistema de movimiento.
- La cámara y el escaneo necesitan una alternativa accesible: elegir el recuerdo
  a mano siempre está disponible.
- Texto que escala sin romper el diseño.

---

## 11. Orden de implementación

Cada bloque deja la aplicación ejecutable, y se comprueban TypeScript, lint y
build al terminarlo.

| # | Bloque | Contenido |
| --- | --- | --- |
| 1 | Sistema de diseño | Tokens, tema claro/oscuro, CSS de transiciones, `manifest` |
| 2 | Datos de ejemplo | Capa aislada con recuerdos realistas |
| 3 | Primitivas | `Button`, `IconButton`, `BottomSheet`, `Skeleton`, `EmptyState` |
| 4 | Shell | Layout y `AppNavigation` |
| 5 | Biblioteca | `MemoryCard`, `MemoryGrid`, búsqueda, estados vacío/carga/error |
| 6 | Detalle | Hero, `MediaGallery`, objetos vinculados, morfología compartida |
| 7 | Creación | `CreateFlow` y `LinkObjectStep` |
| 8 | Escaneo | `ScanCamera`, `RecognitionOverlay`, los tres resultados |
| 9 | Perfil | Pantalla sencilla |
| 10 | Repaso | Responsive, accesibilidad, limpieza de restos |

### 11.1 Encaje con `MIGRATION_PLAN.md`

Este plan adelanta la interfaz de las fases 3, 4, 6 y 7 del plan de migración,
trabajando contra datos de ejemplo en lugar de contra Supabase. Las fases 1 y 2
(base de datos y autenticación) siguen pendientes y son el siguiente trabajo
natural en cuanto exista el proyecto de Supabase. `app.py` se mantiene intacto
hasta la fase 9, como estaba previsto.

---

## 12. La pregunta de control

> ¿Podría alguien que no sabe nada del proyecto entender en menos de un minuto
> cómo crear un recuerdo y cómo volver a abrirlo apuntando a un objeto?

Cómo lo responde este diseño:

- El botón central de la barra inferior es el más visible de la pantalla y abre
  la cámara al instante. Se descubre por curiosidad.
- El estado vacío de la biblioteca enseña el concepto con una imagen de un objeto
  unido a un recuerdo, no con un párrafo explicativo.
- La confirmación al vincular un objeto muestra objeto y recuerdo unidos con la
  frase "Apunta a esto para volver aquí". Esa pantalla es el tutorial.
- Crear un recuerdo son dos datos: una foto y un título.
