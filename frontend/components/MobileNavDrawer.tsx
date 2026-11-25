import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { BrandMark } from "./BrandMark";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onOpenDataDrawer: () => void;
  dataActionIcon: React.ReactNode;
  viewMode: "analyst" | "management";
  onChangeViewMode: (mode: "analyst" | "management") => void;
}

export function MobileNavDrawer({
  open,
  onClose,
  items,
  activeId,
  onSelect,
  onOpenDataDrawer,
  dataActionIcon,
  viewMode,
  onChangeViewMode,
}: MobileNavDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const hasEnteredRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    const sheet = sheetRef.current;
    if (!dialog || !scroller || !sheet) return;

    const visibleThreshold = Math.min(0.05, 1 / Math.max(window.innerWidth, 320));
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry || !dialog.open) return;
        if (entry.intersectionRatio > 0.5) {
          hasEnteredRef.current = true;
        } else if (entry.intersectionRatio < visibleThreshold && hasEnteredRef.current) {
          hasEnteredRef.current = false;
          dialog.close();
          onCloseRef.current();
        }
      },
      { root: dialog, threshold: [visibleThreshold, 0.5, 1] }
    );
    observer.observe(sheet);

    let onScrollFallback: (() => void) | null = null;
    if (!CSS.supports("animation-timeline", "scroll()")) {
      onScrollFallback = () => {
        const ratio = Math.max(
          0,
          Math.min(1, 1 - scroller.scrollLeft / Math.max(sheet.offsetWidth, 1))
        );
        dialog.style.setProperty("--drawer-backdrop", String(ratio));
      };
      scroller.addEventListener("scroll", onScrollFallback, { passive: true });
    }

    return () => {
      observer.disconnect();
      if (onScrollFallback) scroller.removeEventListener("scroll", onScrollFallback);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    if (!dialog || !scroller) return;

    let cancelled = false;
    if (open && !dialog.open) {
      hasEnteredRef.current = false;
      dialog.showModal();
      const startScroll = async () => {
        if (!CSS.supports("scroll-initial-target", "nearest")) {
          scroller.scrollTo({ left: scroller.offsetWidth, behavior: "instant" });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
        }
        if (!cancelled) {
          scroller.scrollTo({ left: 0, behavior: "auto" });
        }
      };
      void startScroll();
    } else if (!open && dialog.open) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "auto" });
    }

    return () => {
      cancelled = true;
    };
  }, [open]);

  const requestClose = () => {
    const scroller = scrollerRef.current;
    const dialog = dialogRef.current;
    if (scroller && hasEnteredRef.current) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "auto" });
    } else if (dialog?.open) {
      hasEnteredRef.current = false;
      dialog.close();
      onClose();
    } else {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="Drawer"
      aria-label="Navigation menu"
      onClick={(e) => {
        if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
          requestClose();
        }
      }}
      onCancel={(e) => {
        if (e.cancelable) {
          e.preventDefault();
          requestClose();
        }
      }}
    >
      <div ref={scrollerRef} className="Drawer-scroller">
        <nav ref={sheetRef} className="Drawer-sheet">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandMark />
              <span className="text-sm font-semibold text-white">Reading Stars</span>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close menu"
              autoFocus
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={18} strokeWidth={1.6} />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {items.map((item) => {
              const active = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    requestClose();
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/12 text-white"
                      : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="my-3 h-px bg-white/10" />

            <button
              type="button"
              onClick={() => {
                requestClose();
                onOpenDataDrawer();
              }}
              className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/6 hover:text-white"
            >
              <span className="shrink-0">{dataActionIcon}</span>
              <span>Dataset and Filters</span>
            </button>

            <div className="mt-3 rounded-xl bg-white/6 p-2">
              <div className="mb-1.5 px-1 text-[11px] font-medium text-zinc-400">View Mode</div>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    ["analyst", "Analyst"],
                    ["management", "Summary"],
                  ] as const
                ).map(([id, label]) => {
                  const active = viewMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onChangeViewMode(id);
                        requestClose();
                      }}
                      className={`h-8 rounded-lg text-xs font-medium transition-colors ${
                        active ? "bg-white text-[#0b0b0d]" : "text-zinc-300 hover:bg-white/10"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>
      </div>
    </dialog>
  );
}
