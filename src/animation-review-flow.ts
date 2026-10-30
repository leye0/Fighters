/** Choose the next unevaluated candidate without losing the input shortlist order. */
export function nextUnreviewed(
  filenames: readonly string[],
  current: string,
  choices: Readonly<Record<string, { choice: string }>>,
): string | null {
  if (!filenames.length) return null;
  const start = Math.max(-1, filenames.indexOf(current));
  for (let step = 1; step <= filenames.length; step++) {
    const name = filenames[(start + step) % filenames.length];
    if ((choices[name]?.choice ?? "unreviewed") === "unreviewed") return name;
  }
  return null;
}
