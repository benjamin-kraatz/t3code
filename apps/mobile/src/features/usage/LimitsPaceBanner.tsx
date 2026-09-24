import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { memo } from "react";
import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { environmentPresentations } from "../../state/presentation";
import { updateMobilePreferencesAtom } from "../../state/preferences";
import { SettingsSection } from "../settings/components/SettingsSection";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import { paceText } from "./UsageLimitsSection";
import { paceWarnings, usePaceWarningEnabled } from "./usePaceWarning";

const DRIVER_LABEL: Partial<Record<string, string>> = { codex: "Codex", claudeAgent: "Claude" };

/**
 * A home-screen nudge when any pooled limit runs ahead of pace, worst first.
 * Reads the limits already pushed with provider snapshots, so it costs no
 * extra requests; tapping opens the Limits tab. `now` is the caller's clock
 * tick, so pace moves with time without a timer of its own.
 */
export const LimitsPaceBanner = memo(function LimitsPaceBanner({ now }: { readonly now: number }) {
  const navigation = useNavigation();
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const enabled = usePaceWarningEnabled();
  if (!enabled) return null;
  const behind = paceWarnings(presentations, now);
  const worst = behind[0];
  if (!worst) return null;
  const provider = DRIVER_LABEL[worst.driver] ?? String(worst.driver);
  const pace = paceText("ahead", worst.window.paceGapPercent);
  const more = behind.length - 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${provider} ${worst.window.label} limit is ${pace}${more > 0 ? `, ${more} more` : ""}`}
      accessibilityHint="Show limits"
      onPress={() =>
        navigation.navigate("SettingsSheet", {
          screen: "SettingsContent",
          params: { screen: "SettingsUsage" },
        })
      }
      className="mx-4 mt-2 mb-1 flex-row items-center gap-2 rounded-xl border border-warning-border bg-warning px-3.5 py-2.5 active:opacity-70"
    >
      <SymbolView
        name="exclamationmark.triangle"
        size={15}
        tintColorClassName="accent-warning-foreground"
      />
      <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
        <Text numberOfLines={1} className="shrink text-sm font-t3-medium text-warning-foreground">
          {provider} · {worst.window.label}
        </Text>
        <Text numberOfLines={1} className="shrink text-sm tabular-nums text-warning-foreground">
          {pace}
        </Text>
      </View>
      {more > 0 ? (
        <Text className="text-xs tabular-nums text-warning-foreground">+{more}</Text>
      ) : null}
      <SymbolView name="chevron.right" size={13} tintColorClassName="accent-warning-foreground" />
    </Pressable>
  );
});

/** Where the banner is switched off, next to the limits it reports on. */
export function LimitsPaceWarningToggle() {
  const enabled = usePaceWarningEnabled();
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  return (
    <SettingsSection>
      <SettingsSwitchRow
        icon="exclamationmark.triangle"
        label="Pace warning on home"
        subtitle="Show a banner when a limit runs ahead of pace."
        value={enabled}
        onValueChange={(value) => savePreferences({ limitsPaceWarningEnabled: value })}
      />
    </SettingsSection>
  );
}
