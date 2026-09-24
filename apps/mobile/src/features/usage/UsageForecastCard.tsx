import type { DailyTotals } from "@t3tools/shared/usageMerge";
import {
  formatDayShort,
  formatTokens,
  formatUsd,
  makeMonthToDateWindow,
  monthProgress,
  projectMonthEndProviders,
  projectMonthEndTokens,
  projectMonthEndValue,
} from "@t3tools/shared/usageFormat";
import { View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { SettingsSection } from "../settings/components/SettingsSection";
import type { UsageChartMetric } from "./usageChartData";
import { PROVIDER_LABEL, PROVIDER_ORDER, useProviderColors } from "./usageProviders";

/**
 * Month-end forecast in its own card, because it always reads the calendar
 * month while every other section follows the period toggle. The bar is the
 * month: the coloured part is how much has passed, split by provider share so
 * far, and the empty tail is what the same daily pace adds by the last day.
 */
export function UsageForecastCard(props: {
  readonly metric: UsageChartMetric;
  readonly monthPeriods: readonly DailyTotals[];
  readonly asOf: Date;
  readonly pending: boolean;
}) {
  const { metric, monthPeriods, asOf } = props;
  const colors = useProviderColors();
  const { dayOfMonth, daysInMonth, elapsedShare } = monthProgress(asOf);
  const monthWindow = makeMonthToDateWindow(asOf);
  const trailing = (
    <Text className="text-xs tabular-nums text-foreground-tertiary">
      Day {dayOfMonth} of {daysInMonth}
    </Text>
  );

  if (props.pending) {
    return (
      <SettingsSection title="This month" trailing={trailing}>
        <Text className="p-4 text-sm text-foreground-muted">Projecting month end…</Text>
      </SettingsSection>
    );
  }

  const monthTokens = monthPeriods.reduce((total, period) => total + period.totalTokens, 0);
  const monthCostUsd = monthPeriods.reduce((total, period) => total + period.costUsd, 0);
  const soFar = metric === "cost" ? monthCostUsd : monthTokens;
  const projected =
    metric === "cost"
      ? projectMonthEndValue(monthCostUsd, asOf)
      : projectMonthEndTokens(monthTokens, asOf);
  const format = metric === "cost" ? formatUsd : formatTokens;
  const projectedProviders = projectMonthEndProviders(monthPeriods, asOf);
  const monthToDateByProvider = new Map<string, number>();
  for (const period of monthPeriods) {
    for (const [provider, usage] of period.byProvider) {
      const value = metric === "cost" ? usage.costUsd : usage.totalTokens;
      monthToDateByProvider.set(provider, (monthToDateByProvider.get(provider) ?? 0) + value);
    }
  }
  const providers = PROVIDER_ORDER.flatMap((provider) => {
    const forecast = projectedProviders.get(provider);
    const value =
      forecast === undefined ? 0 : metric === "cost" ? forecast.costUsd : forecast.totalTokens;
    return value > 0 ? [{ provider, value }] : [];
  });

  return (
    <SettingsSection title="This month" trailing={trailing}>
      <View className="gap-3 p-4">
        <View className="flex-row items-end justify-between gap-4">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-sm text-foreground-muted">
              Projected month end{metric === "cost" ? " · API estimate" : ""}
            </Text>
            <Text className="text-2xl font-t3-bold tabular-nums text-foreground">
              {format(projected)}
            </Text>
          </View>
          <View className="items-end gap-0.5">
            <Text className="text-sm text-foreground-muted">So far</Text>
            <Text className="text-base font-t3-medium tabular-nums text-foreground">
              {format(soFar)}
            </Text>
          </View>
        </View>

        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${format(soFar)} so far, ${format(projected)} projected by ${formatDayShort(
            `${monthWindow.sinceDay.slice(0, 8)}${daysInMonth}`,
          )} at this month's daily pace`}
          className="h-1.5 flex-row overflow-hidden rounded-full bg-subtle"
        >
          <View
            className="h-full flex-row overflow-hidden rounded-full"
            style={{ flex: Math.min(1, elapsedShare) }}
          >
            {providers.map(({ provider }) => (
              <View
                key={provider}
                className="h-full"
                style={{
                  flex: soFar > 0 ? (monthToDateByProvider.get(provider) ?? 0) / soFar : 0,
                  backgroundColor: colors[provider],
                }}
              />
            ))}
          </View>
          <View style={{ flex: Math.max(0, 1 - elapsedShare) }} />
        </View>

        {providers.length > 0 ? (
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            {providers.map(({ provider, value }) => (
              <View key={provider} className="flex-row items-center gap-1.5">
                <View
                  className="size-2 rounded-full"
                  style={{ backgroundColor: colors[provider] }}
                />
                <Text className="text-xs text-foreground-muted">{PROVIDER_LABEL[provider]}</Text>
                <Text className="text-xs font-t3-medium tabular-nums text-foreground">
                  {format(value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </SettingsSection>
  );
}
