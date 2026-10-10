/**
 * MoPH catalogue names read "BRAND strength pack — Dosage form". Split them so the product title can be set as the
 * primary line and the dosage form as a quieter second line. Names without the separator are returned whole.
 */
export function splitProductName(name: string): { title: string; form: string | null } {
  const at = name.indexOf(" — ");
  if (at <= 0) return { title: name, form: null };
  return { title: name.slice(0, at), form: name.slice(at + 3) || null };
}
