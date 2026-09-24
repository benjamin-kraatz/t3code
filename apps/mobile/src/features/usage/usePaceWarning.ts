import { useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import { collectLimitAccounts, collectLimitPools } from "@t3tools/shared/usageLimits";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useState } from "react";

import { environmentPresentations } from "../../state/presentation";
import { mobilePreferencesAtom } from "../../state/preferences";

export function paceWarnings(
  presentations: Parameters<typeof collectLimitAccounts>[0],
  now: number,
) {
  return collectLimitPools(collectLimitAccounts(presentations), now)
    .flatMap((pool) =>
      pool.windows
        .filter((window) => window.pace === "ahead")
        .map((window) => ({ driver: pool.driver, window })),
    )
    .sort((left, right) => (right.window.paceGapPercent ?? 0) - (left.window.paceGapPercent ?? 0));
}

export function usePaceWarningEnabled() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  return !(
    AsyncResult.isSuccess(preferences) && preferences.value.limitsPaceWarningEnabled === false
  );
}

export function useHasPaceWarning() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const enabled = usePaceWarningEnabled();
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const interval = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(interval);
    }, []),
  );
  return enabled && paceWarnings(presentations, now).length > 0;
}
