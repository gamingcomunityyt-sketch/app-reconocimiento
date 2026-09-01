"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CameraStatus =
  | "starting"
  | "ready"
  | "denied"
  | "unavailable"
  | "insecure"
  | "unsupported"
  | "error";

/**
 * Mismo limite que el nucleo de vision (`app.py`, `MAX_DIMENSION`) para registro.
 * El escaneo V10.7 pide ~1800-2200 px si el JPEG sigue dentro del limite de Vercel.
 */
const DEFAULT_MAX_DIMENSION = 1000;
const SCAN_MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

export interface CaptureOptions {
  /** Lado largo maximo del JPEG capturado. */
  maxDimension?: number;
  jpegQuality?: number;
}

export interface Camera {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  /** Devuelve una URL local del fotograma actual, ya reducido. */
  captureFrame: (options?: CaptureOptions) => Promise<string | null>;
  /** Igual que captureFrame pero devuelve el Blob (para APIs de vision). */
  captureBlob: (options?: CaptureOptions) => Promise<Blob | null>;
}

export function useCamera(active: boolean): Camera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function start() {
      // El navegador solo da acceso a la camara en HTTPS o en localhost. Sin
      // esto el fallo se confunde con un permiso denegado.
      if (!window.isSecureContext) {
        setStatus("insecure");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }

      setStatus("starting");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` y no `exact`: en un portatil sin camara trasera preferimos
          // la frontal a un fallo.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Algunos navegadores rechazan play() hasta que hay interaccion.
            // El video sigue mostrandose, asi que no es un fallo fatal.
          }
        }

        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus(classifyError(error));
      }
    }

    void start();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) {
        // Liberar la camara al salir: si no, el indicador del dispositivo se
        // queda encendido y la siguiente pantalla no puede abrirla.
        for (const track of stream.getTracks()) track.stop();
      }
      streamRef.current = null;
    };
  }, [active]);

  const captureBlob = useCallback(async (options?: CaptureOptions): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
    const jpegQuality = options?.jpegQuality ?? JPEG_QUALITY;

    const scale = Math.min(
      1,
      maxDimension / Math.max(video.videoWidth, video.videoHeight),
    );
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", jpegQuality);
    });
  }, []);

  const captureFrame = useCallback(
    async (options?: CaptureOptions): Promise<string | null> => {
      const blob = await captureBlob(options);
      return blob ? URL.createObjectURL(blob) : null;
    },
    [captureBlob],
  );

  // La identidad se mantiene estable para que quien la use en un efecto no lo
  // vuelva a disparar en cada render.
  return useMemo(
    () => ({ videoRef, status, captureFrame, captureBlob }),
    [status, captureFrame, captureBlob],
  );
}

export const CAMERA_CAPTURE = {
  registration: { maxDimension: DEFAULT_MAX_DIMENSION } satisfies CaptureOptions,
  scan: { maxDimension: SCAN_MAX_DIMENSION, jpegQuality: 0.88 } satisfies CaptureOptions,
};

function classifyError(error: unknown): CameraStatus {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "unavailable";
  }
  return "error";
}

export const CAMERA_MESSAGES: Record<
  Exclude<CameraStatus, "ready" | "starting">,
  { title: string; description: string }
> = {
  denied: {
    title: "Necesitamos la camara",
    description:
      "Da permiso a la camara en los ajustes del navegador y vuelve a intentarlo.",
  },
  unavailable: {
    title: "No encontramos ninguna camara",
    description: "Comprueba que el dispositivo tiene una camara disponible.",
  },
  insecure: {
    title: "La camara necesita una conexion segura",
    description:
      "Abre la aplicacion en localhost o mediante https para poder usarla.",
  },
  unsupported: {
    title: "Este navegador no permite usar la camara",
    description: "Prueba con otro navegador para escanear objetos.",
  },
  error: {
    title: "No hemos podido abrir la camara",
    description: "Vuelve a intentarlo en un momento.",
  },
};
