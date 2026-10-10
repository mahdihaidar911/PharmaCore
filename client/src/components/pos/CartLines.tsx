import { formatUsd, type CartItem } from "../../lib/api";
import { Icon } from "../icons";
import { ProductName } from "../ProductName";
import { Status } from "../ui";

/** The current sale as a numbered ledger. The most recently added line carries the lime marker. */
export function CartLines({
  cart,
  lastAddedId,
  onQty,
  onRemove,
}: {
  cart: CartItem[];
  lastAddedId: number | null;
  onQty: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
}) {
  if (cart.length === 0) {
    return (
      <div className="px-4 py-10">
        <p className="font-serif text-lg font-semibold text-ink-2">No items yet</p>
        <p className="mt-1 max-w-sm text-dense text-ink-3">
          Scan a barcode, or type part of a product name and press <span className="kbd">Enter</span>. Use{" "}
          <span className="kbd">↑</span> <span className="kbd">↓</span> to choose between matches.
        </p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th className="hidden w-10 @md:table-cell">#</th>
          <th>Item</th>
          <th className="w-32 text-center">Qty</th>
          <th className="num hidden w-24 @xl:table-cell">Unit</th>
          <th className="num w-28">Amount</th>
          <th className="w-10">
            <span className="sr-only">Remove</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {cart.map((item, i) => {
          const overStock = item.stock !== undefined && item.qty > item.stock;
          const marked = item.product_id === lastAddedId;
          return (
            <tr key={item.product_id} className={marked ? "[&>td]:bg-lime-200/70" : ""}>
              <td className="code hidden text-ink-3 @md:table-cell">{String(i + 1).padStart(2, "0")}</td>
              <td className="w-full max-w-0">
                <ProductName name={item.name} />
                {overStock ? (
                  <Status tone="caution" icon="alert" className="mt-0.5 text-xs">
                    Only {item.stock} in stock
                  </Status>
                ) : null}
              </td>
              <td>
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-icon h-8 min-h-8 w-8 rounded-r-none"
                    aria-label={`One less ${item.name}`}
                    onClick={() => onQty(item.product_id, item.qty - 1)}
                  >
                    <Icon name="minus" className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={`Quantity of ${item.name}`}
                    className="h-8 w-12 border-y border-line-input bg-paper-0 text-center text-sm font-medium text-ink focus:border-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    value={item.qty}
                    onChange={(e) => {
                      const next = Math.floor(Number(e.target.value));
                      if (Number.isFinite(next) && next >= 1) onQty(item.product_id, next);
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-icon h-8 min-h-8 w-8 rounded-l-none"
                    aria-label={`One more ${item.name}`}
                    onClick={() => onQty(item.product_id, item.qty + 1)}
                  >
                    <Icon name="plus" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
              <td className="num hidden text-ink-2 @xl:table-cell">{formatUsd(item.unit_price_usd)}</td>
              <td className="num font-medium text-ink">{formatUsd(item.unit_price_usd * item.qty)}</td>
              <td className="text-right">
                <button type="button" className="btn btn-ghost btn-sm btn-icon h-8 min-h-8 w-8" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.product_id)}>
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
