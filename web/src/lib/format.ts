const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Las fechas llegan como `YYYY-MM-DD`. Se construyen por componentes en lugar
 * de con `new Date(cadena)` porque esa forma las interpreta en UTC y, segun la
 * zona del dispositivo, el dia mostrado se desplazaria.
 */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** "18 may 2024". Discreta, para acompanar al titulo sin competir con el. */
export function formatMemoryDate(value: string | null): string | null {
  if (!value) return null;
  const date = parseIsoDate(value);
  if (!date) return null;
  return dateFormatter.format(date).replace(".", "");
}

/** "4:12". Para audios y videos. */
export function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** "5 fotos", "1 foto". El plural mal puesto delata que nadie lo reviso. */
export function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
