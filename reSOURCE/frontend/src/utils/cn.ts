/**
 * Joins class names, skipping falsy values.
 * Keeps conditional Tailwind classes readable without extra dependencies.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
