import { formatUsd, type CartItem } from "../../lib/api";
import { Icon } from "../icons";
import { ProductName } from "../ProductName";
import { Status } from "../ui";

const SHORTCUTS: [string[], string][] = [
  [["Scan"], "a barcode — the line is added at once"],
  [["Type", "↑", "↓", "Enter"], "search by name, choose, add"],
  [["F4"], "hold this sale · F3 for held sales"],
  [["F7", "F8"], "customer pays the exact total in USD / LBP"],
  [["Ctrl", "↵"], "complete the sale and print"],
];

/** The current sale. The most recently added line carries the emerald edge. */
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
      <div className="flex h-full flex-col justify-center px-6 py-10">
        <p className="text-lg font-semibold tracking-[-0.01em] text-fg">Ready for the next customer</p>
        <p className="mt-1 text-dense text-fg-3">The till works from the keyboard and the scanner.</p>
        <dl className="mt-5 grid max-w-lg gap-2.5">
          {SHORTCUTS.map(([keys, text]) => (
            <div key={text} className="grid grid-cols-[9.5rem_1fr] items-center gap-4 text-dense">
              <dt className="flex flex-wrap justify-end gap-1">
                {keys.map((k) => (
                  <span key={k} className="kbd h-6 min-w-6 px-1.5 text-xs">
                    {k}
                  </span>
                ))}
              </dt>
              <dd className="text-fg-2">{text}</dd>
            </div>
          ))}
        </dl>
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
            <tr key={item.product_id} className={marked ? "is-selected [&>td]:animate-flash" : ""}>
              <td className="code hidden text-fg-3 @md:table-cell">{String(i + 1).padStart(2, "0")}</td>
              <td className="w-full max-w-0 py-2.5">
                <ProductName name={item.name} />
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
                  <span className="code">{item.barcode ?? "no barcode"}</span>
                  {item.stock !== undefined && !overStock ? <span>· {item.stock} in stock</span> : null}
                </p>
                {overStock ? (
                  <Status tone="caution" icon="alert" className="mt-0.5 text-xs">
                    Only {item.stock} in stock
                  </Status>
                ) : null}
              </td>
              <td>
                <div className="flex items-center justify-center overflow-hidden rounded-sm border border-line-input/70 bg-surface">
                  <button
                    type="button"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
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
                    className="h-8 w-11 border-x border-line bg-transparent text-center text-sm font-semibold text-fg focus:bg-accent-soft focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    value={item.qty}
                    onChange={(e) => {
                      const next = Math.floor(Number(e.target.value));
                      if (Number.isFinite(next) && next >= 1) onQty(item.product_id, next);
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
                    aria-label={`One more ${item.name}`}
                    onClick={() => onQty(item.product_id, item.qty + 1)}
                  >
                    <Icon name="plus" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
              <td className="num hidden text-fg-3 @xl:table-cell">{formatUsd(item.unit_price_usd)}</td>
              <td className="num text-[15px] font-semibold text-fg">{formatUsd(item.unit_price_usd * item.qty)}</td>
              <td className="text-right">
                <button type="button" className="btn btn-ghost btn-sm btn-icon h-8 min-h-8 w-8 hover:text-danger" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.product_id)}>
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
