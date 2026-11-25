import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  type?: "string" | "number";
  align?: "left" | "right";
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  caption: string;
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  initialSortKey?: string;
  initialSortDir?: "ascending" | "descending";
  onRowClick?: (row: T) => void;
  stackOnNarrow?: boolean;
  maxHeightClass?: string;
  emptyMessage?: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  initialSortKey,
  initialSortDir = "ascending",
  onRowClick,
  stackOnNarrow = true,
  maxHeightClass = "",
  emptyMessage = "No matching records in this filter selection.",
}: DataTableProps<T>) {
  const captionId = useId();
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey ?? null);
  const [sortDir, setSortDir] = useState<"ascending" | "descending">(initialSortDir);
  const [statusMsg, setStatusMsg] = useState("");

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return rows;
    const factor = sortDir === "ascending" ? 1 : -1;
    const getVal = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (col.type === "number") {
        return factor * (Number(va) - Number(vb));
      }
      return factor * collator.compare(String(va), String(vb));
    });
  }, [rows, columns, sortKey, sortDir]);

  const handleSort = (col: ColumnDef<T>) => {
    if (!col.sortable || !col.sortValue) return;
    const nextDir: "ascending" | "descending" =
      sortKey === col.key && sortDir === "ascending" ? "descending" : "ascending";
    setSortKey(col.key);
    setSortDir(nextDir);
    setStatusMsg(`Sorted by ${col.header}, ${nextDir}, ${rows.length} rows`);
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      role="region"
      aria-labelledby={captionId}
      className={`table-region ${maxHeightClass}`}
    >
      <div role="status" className="sr-only-status">
        {statusMsg}
      </div>
      <table className={`data-table ${stackOnNarrow ? "stack-on-narrow" : ""}`}>
        <caption id={captionId}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  data-align={col.align ?? "left"}
                  aria-sort={isSorted ? sortDir : undefined}
                >
                  {col.sortable && col.sortValue ? (
                    <button type="button" onClick={() => handleSort(col)}>
                      <span>{col.header}</span>
                      <span aria-hidden="true" className="inline-flex shrink-0 opacity-70">
                        {isSorted ? (
                          sortDir === "ascending" ? (
                            <ArrowUp size={13} strokeWidth={1.6} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={1.6} />
                          )
                        ) : (
                          <ArrowUpDown size={13} strokeWidth={1.5} />
                        )}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => (
            <tr
              key={rowKey(row, idx)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  data-label={col.header}
                  data-align={col.align ?? "left"}
                >
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
