interface KpiCardProps {
  value: string;
  label: string;
  progressPct: number;
  progressRightLabel: string;
  progressLeftLabel?: string;
  variant: "hero" | "periwinkle" | "slate" | "rose";
  icon: React.ReactNode;
}

export function KpiCard({
  value,
  label,
  progressPct,
  progressRightLabel,
  progressLeftLabel = "0%",
  variant,
  icon,
}: KpiCardProps) {
  const clamped = Math.max(4, Math.min(100, progressPct));
  const isHero = variant === "hero";

  const iconWrapStyle: Record<KpiCardProps["variant"], React.CSSProperties> = {
    hero: { backgroundColor: "rgba(255, 255, 255, 0.12)", color: "#ffffff" },
    periwinkle: { backgroundColor: "var(--accent-periwinkle-bg)", color: "var(--text-primary)" },
    slate: { backgroundColor: "var(--accent-slate-bg)", color: "var(--text-primary)" },
    rose: { backgroundColor: "var(--accent-rose-bg)", color: "var(--text-primary)" },
  };

  const fillClass: Record<KpiCardProps["variant"], string> = {
    hero: "bg-white",
    periwinkle: "hatch-fill-periwinkle",
    slate: "hatch-fill-slate",
    rose: "hatch-fill-rose",
  };

  return (
    <article
      className="flex flex-col justify-between rounded-[14px] p-5 transition-colors"
      style={{
        backgroundColor: isHero ? "var(--bg-hero-card)" : "var(--bg-surface)",
        color: isHero ? "var(--text-hero-card)" : "var(--text-primary)",
        border: isHero ? "1px solid transparent" : "1px solid var(--border-hairline)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="tabular-nums text-[28px] font-semibold leading-tight tracking-[-0.02em]">
            {value}
          </div>
          <div
            className="mt-1 text-[13px] font-normal leading-snug"
            style={{ color: isHero ? "var(--text-hero-muted)" : "var(--text-muted)" }}
          >
            {label}
          </div>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
          style={iconWrapStyle[variant]}
          aria-hidden="true"
        >
          {icon}
        </div>
      </div>

      <div className="mt-5">
        <div
          className="mb-1.5 flex items-center justify-between text-[11px] font-mono-num"
          style={{ color: isHero ? "var(--text-hero-muted)" : "var(--text-muted)" }}
        >
          <span>{progressLeftLabel}</span>
          <span
            className="font-medium"
            style={{ color: isHero ? "#ffffff" : "var(--text-primary)" }}
          >
            {progressRightLabel}
          </span>
        </div>
        <div
          className={`h-1.5 w-full overflow-hidden rounded-full ${
            isHero ? "hatch-track-dark" : "bg-[var(--bg-subtle)]"
          }`}
        >
          <div
            className={`h-full rounded-full ${fillClass[variant]}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    </article>
  );
}
