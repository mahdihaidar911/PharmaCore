import { formatLbp, formatUsd, usdToLbp, type PosProduct } from "../../lib/api";
import { ProductName } from "../ProductName";
import { Status } from "../ui";

/** Search matches under the scan field. Arrow keys move the lime marker; Enter or click adds. */
export function ScanResults({
  results,
  activeIndex,
  rate,
  onPick,
  onHover,
}: {
  results: PosProduct[];
  activeIndex: number;
  rate: number;
  onPick: (product: PosProduct) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ul
      id="pos-results"
      role="listbox"
      aria-label="Matching products"
      className="@container absolute inset-x-0 top-full z-30 mt-1 max-h-[min(26rem,55vh)] overflow-auto rounded-md border border-rule-strong bg-paper-0 shadow-overlay"
    >
      {results.map((product, i) => {
        const outOfStock = product.total_qty <= 0;
        const active = i === activeIndex;
        return (
          <li key={product.id} id={`pos-result-${product.id}`} role="option" aria-selected={active} aria-disabled={outOfStock}>
            <button
              type="button"
              tabIndex={-1}
              disabled={outOfStock}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(product)}
              onMouseEnter={() => onHover(i)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-rule px-4 py-2 text-left last:border-0 @xl:grid-cols-[minmax(0,1fr)_7.5rem_7rem] ${
                outOfStock ? "cursor-not-allowed text-ink-3" : active ? "bg-lime-200" : "hover:bg-paper"
              }`}
            >
              <span className="min-w-0">
                <ProductName name={product.name} className={outOfStock ? "opacity-70" : ""} />
                <span className="code block text-xs text-ink-3">{product.barcode ?? "no barcode"}</span>
              </span>
              <span className="order-last col-span-2 text-dense @xl:order-none @xl:col-span-1">
                {outOfStock ? (
                  <Status tone="danger">Out of stock</Status>
                ) : (
                  <span className="text-ink-2">
                    <span className="font-medium text-ink">{product.total_qty}</span> in stock
                  </span>
                )}
              </span>
              <span className="text-right">
                <span className="block font-medium text-ink">{formatUsd(product.sale_price_usd)}</span>
                <span className="block text-xs text-ink-3">{formatLbp(usdToLbp(product.sale_price_usd, rate))}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
