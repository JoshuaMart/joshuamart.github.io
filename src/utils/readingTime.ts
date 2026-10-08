const WORDS_PER_MINUTE = 230;

/** Estimated reading time of a post body, in whole minutes (at least 1). */
export function readingMinutes(body: string | undefined): number {
  const words = (body ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
