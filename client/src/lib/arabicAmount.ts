/** Arabic amount in words for LBP receipts (integer lira, formal pharmacy style). */

const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const tens = [
  "",
  "عشرة",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];
const teens = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];

function under100(n: number): string {
  if (n === 0) return "";
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (o === 0) return tens[t];
  return `${ones[o]} و ${tens[t]}`;
}

function under1000(n: number): string {
  if (n === 0) return "";
  if (n < 100) return under100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  const hundred =
    h === 1 ? "مئة" : h === 2 ? "مئتان" : `${ones[h]} مئة`;
  if (r === 0) return hundred;
  return `${hundred} و ${under100(r)}`;
}

function chunkToWords(n: number, singular: string, dual: string, plural: string): string {
  if (n === 0) return "";
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${under1000(n)} ${plural}`;
  return `${under1000(n)} ${singular}`;
}

function integerToArabic(n: number): string {
  if (n === 0) return "صفر";
  const parts: string[] = [];

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const m = chunkToWords(millions, "مليون", "مليونان", "ملايين");
  if (m) parts.push(m);

  if (thousands === 1) parts.push("ألف");
  else if (thousands === 2) parts.push("ألفان");
  else if (thousands > 2 && thousands <= 10) parts.push(`${under1000(thousands)} آلاف`);
  else if (thousands > 10) parts.push(`${under1000(thousands)} ألف`);

  const r = under1000(rest);
  if (r) parts.push(r);

  return parts.join(" و ");
}

/** e.g. فقط ست مئة واثنان وثلاثون ألف ليرة لبنانية لا غير */
export function lbpAmountInArabicWords(amountLbp: number): string {
  const whole = Math.round(amountLbp);
  const words = integerToArabic(whole);
  return `فقط ${words} ليرة لبنانية لا غير`;
}
