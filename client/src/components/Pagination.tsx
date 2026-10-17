import { Icon } from "./icons";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

export function Pagination({ page, totalPages, total, pageSize, onPageChange, disabled }: Props) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-dense">
      <p className="text-fg-2">
        <span className="font-medium text-fg">
          {from.toLocaleString()}–{to.toLocaleString()}
        </span>{" "}
        of {total.toLocaleString()}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <span className="meta">
            Page {page} of {totalPages}
          </span>
          <div className="flex">
            <button
              type="button"
              disabled={disabled || page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="btn btn-secondary btn-sm btn-icon rounded-r-none"
              aria-label="Previous page"
            >
              <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              disabled={disabled || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="btn btn-secondary btn-sm btn-icon -ml-px rounded-l-none"
              aria-label="Next page"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
