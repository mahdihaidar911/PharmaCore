/** Normalize keyboard-wedge scanner input (strip control chars, GS1 prefixes). */
export function normalizeScan(raw: string): string {
  let s = raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
  // Some scanners prefix GS1 symbology identifiers
  s = s.replace(/^\](C1|C0|E0|e0|Q3)/i, "");
  return s.trim();
}

/** Typical EAN/UPC length after a wedge scan (digits only). */
export function looksLikeBarcodeScan(value: string): boolean {
  const s = normalizeScan(value);
  return /^\d{6,14}$/.test(s);
}

export function barcodeVariants(code: string): string[] {
  const q = normalizeScan(code);
  if (!q) return [];
  const variants = new Set<string>([q]);
  if (/^\d+$/.test(q)) {
    const noLead = q.replace(/^0+/, "") || "0";
    variants.add(noLead);
    variants.add(q.padStart(13, "0"));
    variants.add(noLead.padStart(13, "0"));
  }
  return [...variants];
}

export function isExactBarcodeMatch(productBarcode: string | null | undefined, scanned: string): boolean {
  const bc = (productBarcode ?? "").trim();
  if (!bc) return false;
  const variants = new Set(barcodeVariants(scanned));
  return variants.has(bc) || barcodeVariants(bc).some((v) => variants.has(v));
}
