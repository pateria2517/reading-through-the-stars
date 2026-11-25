import type { DivergenceClass, TriageTier } from "../engine/types";

export function TierBadge({ tier }: { tier: TriageTier }) {
  const map: Record<TriageTier, { bg: string; fg: string; dot: string; label: string }> = {
    CRITICAL: {
      bg: "var(--status-crit-bg)",
      fg: "var(--status-crit-fg)",
      dot: "var(--status-crit-dot)",
      label: "Critical",
    },
    CAUTION: {
      bg: "var(--status-caut-bg)",
      fg: "var(--status-caut-fg)",
      dot: "var(--status-caut-dot)",
      label: "Caution",
    },
    REVIEW: {
      bg: "var(--status-rev-bg)",
      fg: "var(--status-rev-fg)",
      dot: "var(--status-rev-dot)",
      label: "Review",
    },
    HEALTHY: {
      bg: "var(--status-ok-bg)",
      fg: "var(--status-ok-fg)",
      dot: "var(--status-ok-dot)",
      label: "Healthy",
    },
  };
  const s = map[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: s.dot }}
        aria-hidden="true"
      />
      <span>{s.label}</span>
    </span>
  );
}

export function DivergenceBadge({ cls }: { cls: DivergenceClass }) {
  if (cls === "Hidden_Risk") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: "var(--status-crit-bg)", color: "var(--status-crit-fg)" }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: "var(--status-crit-dot)" }}
          aria-hidden="true"
        />
        <span>Hidden Risk</span>
      </span>
    );
  }
  if (cls === "Rating_Mismatch") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: "var(--status-caut-bg)", color: "var(--status-caut-fg)" }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: "var(--status-caut-dot)" }}
          aria-hidden="true"
        />
        <span>Mismatch</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-secondary)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: "var(--text-muted)" }}
        aria-hidden="true"
      />
      <span>Aligned</span>
    </span>
  );
}
