import type { SaleDetail } from "../lib/api";
import { buildReceiptHtml, printReceipt as openPrintReceipt } from "../lib/receiptTemplate";

type ReceiptProps = {
  detail: SaleDetail;
};

export default function Receipt({ detail }: ReceiptProps) {
  const html = buildReceiptHtml(detail);

  return (
    <div className="mx-auto max-h-[80vh] max-w-4xl overflow-auto rounded-sm border border-line-strong bg-surface">
      <iframe
        title={`Receipt ${detail.sale.id}`}
        srcDoc={html}
        className="min-h-[297mm] w-full border-0"
        sandbox="allow-same-origin"
      />
    </div>
  );
}

export function printReceipt(detail: SaleDetail) {
  openPrintReceipt(detail);
}
