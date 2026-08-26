/**
 * Telemetria del escaneo, solo para desarrollo y depuracion.
 *
 * Guarda una traza en sessionStorage y en consola. Cuando exista `/api/scan`,
 * estos eventos se pueden enviar al servidor como `scan_events`.
 */

export type ScanTelemetryKind =
  | "scan_mount"
  | "camera_status"
  | "phase_change"
  | "frame_captured"
  | "candidates_ready"
  | "resolve_start"
  | "resolve_done"
  | "retry"
  | "navigate";

export interface ScanTelemetryEvent {
  id: string;
  at: number;
  kind: ScanTelemetryKind;
  data: Record<string, unknown>;
}

const STORAGE_KEY = "recuerdos:scan-telemetry";
const MAX_EVENTS = 60;

let debugEnabled = false;
let sessionId = "";

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readEvents(): ScanTelemetryEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScanTelemetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: ScanTelemetryEvent[]): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
}

export function configureScanTelemetry(options: {
  debug: boolean;
  sessionId?: string;
}): void {
  debugEnabled = options.debug;
  if (options.sessionId) sessionId = options.sessionId;
}

export function isScanDebugEnabled(): boolean {
  return debugEnabled || process.env.NODE_ENV === "development";
}

export function trackScanEvent(
  kind: ScanTelemetryKind,
  data: Record<string, unknown> = {},
): ScanTelemetryEvent {
  const event: ScanTelemetryEvent = {
    id: nextId(),
    at: Date.now(),
    kind,
    data: sessionId ? { sessionId, ...data } : data,
  };

  const events = [...readEvents(), event];
  writeEvents(events);

  if (isScanDebugEnabled()) {
    console.info(`[scan] ${kind}`, event.data);
  }

  return event;
}

export function getScanTelemetryEvents(): ScanTelemetryEvent[] {
  return readEvents();
}

export function clearScanTelemetry(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function formatScanEventTime(at: number): string {
  return new Date(at).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}
