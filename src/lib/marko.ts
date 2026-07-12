/**
 * Generate a default marko (stock mark) from a name.
 * Owned stock  -> business name  (e.g. "Ramesh Construction" -> "RC")
 * Borrowed stock -> supplier name (e.g. "Patel Suppliers"    -> "PS")
 * Single-word names fall back to the first 3 letters ("Shah" -> "SHA").
 * Users can always overwrite the suggestion; whatever they save is kept.
 */
export function genMarko(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  }
  return clean.slice(0, 3).toUpperCase();
}
