import { splitProductName } from "../lib/productName";

/** Product title on the first line, dosage form on a quieter second line (or inline when `inline`). */
export function ProductName({ name, inline = false, className = "" }: { name: string; inline?: boolean; className?: string }) {
  const { title, form } = splitProductName(name);
  if (inline) {
    return (
      <span className={className} title={name}>
        <span className="font-medium text-ink">{title}</span>
        {form ? <span className="text-ink-3"> · {form}</span> : null}
      </span>
    );
  }
  return (
    <span className={`block min-w-0 ${className}`.trim()} title={name}>
      <span className="block truncate font-medium text-ink">{title}</span>
      {form ? <span className="block truncate text-xs text-ink-3">{form}</span> : null}
    </span>
  );
}
