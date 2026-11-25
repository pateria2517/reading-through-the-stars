import { useCallback, useEffect, useState } from "react";

export type ColorSchemePreference = "light" | "dark" | "system";

function getSystemScheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredScheme(): "light" | "dark" | null {
  try {
    const val = localStorage.getItem("color-scheme");
    return val === "light" || val === "dark" ? val : null;
  } catch {
    return null;
  }
}

export function useColorScheme() {
  const [stored, setStored] = useState<"light" | "dark" | null>(() => readStoredScheme());
  const [systemScheme, setSystemScheme] = useState<"light" | "dark">(() => getSystemScheme());

  const resolvedScheme: "light" | "dark" = stored ?? systemScheme;

  const syncMeta = useCallback((nextStored: "light" | "dark" | null) => {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute("content", nextStored ?? "light dark");
    }
  }, []);

  useEffect(() => {
    syncMeta(stored);
  }, [stored, syncMeta]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMqChange = (e: MediaQueryListEvent) => {
      setSystemScheme(e.matches ? "dark" : "light");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "color-scheme") {
        const val = e.newValue === "light" || e.newValue === "dark" ? e.newValue : null;
        setStored(val);
      }
    };
    mq.addEventListener("change", onMqChange);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onMqChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Two-state toggle per modern-web-guidance:
  // If target matches system preference, remove stored value; otherwise store literal override.
  const toggleScheme = useCallback(() => {
    const target: "light" | "dark" = resolvedScheme === "dark" ? "light" : "dark";
    const sys = getSystemScheme();
    if (target === sys) {
      try {
        localStorage.removeItem("color-scheme");
      } catch {
        // ignore storage errors
      }
      setStored(null);
      syncMeta(null);
    } else {
      try {
        localStorage.setItem("color-scheme", target);
      } catch {
        // ignore storage errors
      }
      setStored(target);
      syncMeta(target);
    }
  }, [resolvedScheme, syncMeta]);

  return { resolvedScheme, isOverridden: stored !== null, toggleScheme };
}
