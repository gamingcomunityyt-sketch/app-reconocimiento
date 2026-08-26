type ClassValue = string | false | null | undefined;

/** Une clases condicionales sin arrastrar una dependencia para algo tan corto. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
