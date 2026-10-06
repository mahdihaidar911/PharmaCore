import { lbpAmountInArabicWords } from "./arabicAmount";
import { lebanonPharmacyLogoSvg } from "./lebanonPharmacyLogo";
import { formatLbp, formatUsd, usdToLbp, type PharmacySettings, type SaleDetail } from "./api";

function esc(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatReceiptLbp(amount: number) {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatReceiptDate(iso: string) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function paymentLabel(method: string) {
  if (method === "card") return { en: "Paid Card", ar: "مدفوع ببطاقة" };
  if (method === "mixed") return { en: "Paid Mixed", ar: "مدفوع مختلط" };
  return { en: "Paid Cash", ar: "القيمة وصلتنا عداً و نقداً" };
}

function changeHtml(sale: SaleDetail["sale"]) {
  const parts: string[] = [];
  if ((sale.change_usd ?? 0) > 0) parts.push(formatUsd(sale.change_usd!));
  if ((sale.change_lbp ?? 0) > 0) parts.push(formatLbp(sale.change_lbp!));
  if (parts.length === 0) return "";
  return `<p class="change"><strong>Change to return:</strong> ${esc(parts.join(" · "))}</p>`;
}

/** One full-width row: English label+value (left half) | Arabic label+value (right half). */
function profileRow(enLabel: string, arLabel: string, value: string) {
  const v = value.trim() || "—";
  return `<tr>
    <td class="side-en"><span class="lbl">${esc(enLabel)}</span> <span class="val">${esc(v)}</span></td>
    <td class="side-ar" dir="rtl"><span class="lbl">${esc(arLabel)}</span> <span class="val">${esc(v)}</span></td>
  </tr>`;
}

function shortLineName(name: string) {
  const dash = name.indexOf(" — ");
  return dash > 0 ? name.slice(0, dash).trim() : name.trim();
}

export function buildReceiptHtml(detail: SaleDetail) {
  const { sale, lines, settings } = detail;
  const s = settings as PharmacySettings;
  const rate = sale.exchange_rate_used;
  const location = (s.location || s.address || "").trim();
  const pay = paymentLabel(sale.payment_method);
  const receiptNo = String(sale.id);
  const date = formatReceiptDate(sale.created_at);
  const amountWords = lbpAmountInArabicWords(sale.total_lbp);
  const nameAr = (s.name_ar ?? "").trim() || s.name;

  const lineRows = lines
    .map((line) => {
      const unitLbp = usdToLbp(line.unit_price_usd, rate);
      const lineLbp = usdToLbp(line.line_total_usd, rate);
      const moph = (line.moph_code ?? "").trim() || "—";
      return `<tr>
        <td class="c">${line.qty}</td>
        <td class="c">${esc(moph)}</td>
        <td class="desc">${esc(shortLineName(line.product_name))}</td>
        <td class="n">${formatReceiptLbp(unitLbp)}</td>
        <td class="n">${formatReceiptLbp(lineLbp)}</td>
      </tr>`;
    })
    .join("");

  const discountLbp =
    sale.discount_usd > 0
      ? `<tr><td colspan="4" class="lbl">Discount</td><td class="n">-${formatReceiptLbp(usdToLbp(sale.discount_usd, rate))}</td></tr>`
      : "";

  const profileRows = [
    profileRow("Pharmacist", "الصيدلي", s.pharmacist_name ?? ""),
    profileRow("Licence No", "رقم الخبرة", s.license_no ?? ""),
    profileRow("Order Reg. No", "رقم الترتيب", s.order_reg_no ?? ""),
    profileRow("CNSS No", "رقم الضمان", s.cnss_no ?? ""),
    profileRow("Location", "العنوان", location),
    profileRow("Tel", "الهاتف", s.phone ?? ""),
  ].join("");

  const footerLines = [s.receipt_footer?.trim(), "PharmaCore — Pharmacy management"]
    .filter(Boolean)
    .map((line) => `<p>${esc(line!)}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Receipt ${receiptNo}</title>
  <style>
    @page { size: A4 portrait; margin: 5mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; color: #000; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.25; }
    .page { width: 100%; min-height: 100vh; padding: 0; display: flex; flex-direction: column; }
    .block { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .block td { border: 1px solid #000; vertical-align: middle; }
    .names-en { width: 50%; padding: 3mm; font-weight: bold; font-size: 12pt; text-transform: uppercase; text-align: left; }
    .names-ar { width: 50%; padding: 3mm; font-weight: bold; font-size: 12pt; text-align: right; direction: rtl; }
    .logo-row td { padding: 3mm; text-align: center; border-top: none; }
    .side-en { width: 50%; padding: 1.5mm 3mm; text-align: left; border-top: none; }
    .side-ar { width: 50%; padding: 1.5mm 3mm; text-align: right; border-top: none; border-left: none; }
    .side-en .lbl, .side-ar .lbl { display: inline-block; min-width: 28mm; }
    .side-en .val, .side-ar .val { font-weight: bold; }
    .mid-meta { margin-top: 2mm; font-size: 9pt; line-height: 1.4; }
    .customer .side-en, .customer .side-ar { padding: 2mm 3mm; font-size: 9.5pt; }
    .items { width: 100%; border-collapse: collapse; margin-top: -1px; font-size: 9pt; }
    .items th, .items td { border: 1px solid #000; padding: 1.5mm 2mm; }
    .items th { font-weight: bold; text-align: center; vertical-align: middle; }
    .items th .ar { display: block; font-size: 8.5pt; direction: rtl; }
    .items .desc { text-align: left; }
    .items .c, .items .n { text-align: right; white-space: nowrap; }
    .totals { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: -1px; }
    .totals td { border: 1px solid #000; padding: 2mm 3mm; }
    .totals .lbl { font-weight: bold; width: 70%; }
    .totals .n { text-align: right; font-weight: bold; }
    .words { font-size: 10pt; font-weight: bold; direction: rtl; text-align: right; padding: 3mm; border: 1px solid #000; border-top: none; }
    .pay-row { display: flex; justify-content: space-between; border: 1px solid #000; border-top: none; padding: 2mm 3mm; font-weight: bold; }
    .sig-row { display: flex; justify-content: space-between; border: 1px solid #000; border-top: none; padding: 10mm 3mm 2mm; min-height: 16mm; }
    .footer { border: 1px solid #000; border-top: none; padding: 2mm; font-size: 8pt; text-align: center; margin-top: auto; }
    .footer p { margin: 1px 0; }
    .change { text-align: center; padding: 2mm; border: 1px solid #000; border-top: none; margin: 0; }
    @media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <table class="block">
      <tr>
        <td class="names-en">${esc(s.name)}</td>
        <td class="names-ar">${esc(nameAr)}</td>
      </tr>
      <tr class="logo-row">
        <td colspan="2">
          ${lebanonPharmacyLogoSvg(64)}
          <div class="mid-meta">
            ${s.vat_no ? `<div><strong>Vat#</strong> ${esc(s.vat_no)}</div>` : ""}
            <div><strong>No:</strong> ${esc(receiptNo)} &nbsp; ${esc(date)}</div>
          </div>
        </td>
      </tr>
      ${profileRows}
    </table>

    <table class="block customer">
      <tr>
        <td class="side-en">Due M. : _______________________</td>
        <td class="side-ar">المطلوب من السيد(ة) : _______________________</td>
      </tr>
    </table>

    <table class="items">
      <thead>
        <tr>
          <th style="width:6%">Qty<span class="ar">الكمية</span></th>
          <th style="width:10%">MOH<span class="ar">رقم الوزارة</span></th>
          <th>Brand name<span class="ar">الشرح</span></th>
          <th style="width:14%">Unit Price<span class="ar">السعر الإفرادي</span></th>
          <th style="width:14%">Amount<span class="ar">السعر الإجمالي</span></th>
        </tr>
      </thead>
      <tbody>${lineRows}${discountLbp}</tbody>
    </table>

    <table class="totals">
      <tr><td class="lbl">Total / المجموع</td><td class="n">${formatReceiptLbp(sale.total_lbp)}</td></tr>
      <tr><td class="lbl">VAT 11% / ضريبة القيمة المضافة</td><td class="n">0.00</td></tr>
    </table>

    <div class="words">${esc(amountWords)}</div>
    <div class="pay-row"><span>${esc(pay.en)}</span><span dir="rtl">${esc(pay.ar)}</span></div>
    ${changeHtml(sale)}
    <div class="sig-row"><span>Sig. &amp; Stamp</span><span dir="rtl">الختم والتوقيع</span></div>
    <div class="footer"><p>* : VAT Products</p>${footerLines}</div>
  </div>
</body>
</html>`;
}

export function printReceipt(detail: SaleDetail) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(buildReceiptHtml(detail));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}
