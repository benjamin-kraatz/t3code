import { useAtomValue } from "@effect/atom-react";
import { collectLimitAccounts, collectLimitPools } from "@t3tools/shared/usageLimits";
import { useEffect, useState, useSyncExternalStore } from "react";

import { environmentPresentations } from "../../state/presentation";

const STORAGE_KEY = "t3code:limits-pace-warning-enabled";
const listeners = new Set<() => void>();
let fallbackEnabled = true;

function readEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return fallbackEnabled;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePaceWarningEnabled() {
  return useSyncExternalStore(subscribe, readEnabled, () => true);
}

export function setPaceWarningEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    fallbackEnabled = enabled;
  }
  listeners.forEach((listener) => listener());
}

export function usePaceWarnings() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const enabled = usePaceWarningEnabled();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  if (!enabled) return [];
  return collectLimitPools(collectLimitAccounts(presentations), now)
    .flatMap((pool) =>
      pool.windows
        .filter((window) => window.pace === "ahead")
        .map((window) => ({ driver: pool.driver, window })),
    )
    .sort((left, right) => (right.window.paceGapPercent ?? 0) - (left.window.paceGapPercent ?? 0));
}
