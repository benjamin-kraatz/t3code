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

import { Skeleton } from "../ui/skeleton";
import type { UsageChartMetric } from "./UsageProviderChart";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";

/**
 * Month-end forecast, kept apart from the period-scoped figures above it
 * because it always reads the calendar month regardless of the selected
 * window. The bar is the month: the solid part is how much of it has passed,
 * split by provider share so far, and the hatched tail is what the same daily
 * pace adds by the last day. Read left to right it is "so far" to "projected".
 */
export function UsageForecast({
  metric,
  monthPeriods,
  asOf,
}: {
  readonly metric: UsageChartMetric;
  readonly monthPeriods: readonly DailyTotals[];
  readonly asOf: Date;
}) {
  const { dayOfMonth, daysInMonth, elapsedShare } = monthProgress(asOf);
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
    return value > 0 ? [{ provider, value, soFar: monthToDateByProvider.get(provider) ?? 0 }] : [];
  });
  const monthWindow = makeMonthToDateWindow(asOf);
  const monthLabel = `${formatDayShort(monthWindow.sinceDay)} to ${formatDayShort(monthWindow.untilDay)}`;
  const lastDay = formatDayShort(`${monthWindow.sinceDay.slice(0, 8)}${daysInMonth}`);

  return (
    <section aria-label="Month-end forecast" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">This month</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          Day {dayOfMonth} of {daysInMonth} · {monthLabel}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Projected month end{metric === "cost" ? " · API estimate" : ""}
            </span>
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {format(projected)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 text-end">
            <span className="text-xs text-muted-foreground">So far</span>
            <span className="text-base font-medium text-foreground tabular-nums">
              {format(soFar)}
            </span>
          </div>
        </div>

        <div
          role="img"
          aria-label={`${format(soFar)} so far, ${format(projected)} projected by ${lastDay} at this month's daily pace`}
          className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            aria-hidden
            className="absolute inset-y-0 start-0 flex overflow-hidden rounded-full"
            style={{ width: `${Math.min(100, elapsedShare * 100)}%` }}
          >
            {providers.map(({ provider }) => {
              const share = soFar > 0 ? (monthToDateByProvider.get(provider) ?? 0) / soFar : 0;
              return (
                <div
                  key={provider}
                  className="h-full"
                  style={{
                    flexGrow: share,
                    backgroundColor: PROVIDER_PRESENTATION[provider].color,
                  }}
                />
              );
            })}
          </div>
          <div
            aria-hidden
            className="absolute inset-y-0 end-0"
            style={{
              width: `${Math.max(0, 100 - elapsedShare * 100)}%`,
              backgroundImage:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--muted-foreground) 35%, transparent) 0 1.5px, transparent 1.5px 4px)",
            }}
          />
        </div>

        {providers.length > 0 ? (
          // Hovering any provider figure swaps the whole row to month-to-date,
          // so the values stay comparable with each other and with "So far" above.
          <ul className="group/forecast-row flex flex-wrap items-center gap-x-5 gap-y-1">
            {providers.map(({ provider, value, soFar: providerSoFar }) => (
              <li key={provider} className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: PROVIDER_PRESENTATION[provider].color }}
                />
                <span className="text-muted-foreground">
                  {PROVIDER_PRESENTATION[provider].label}
                </span>
                <span className="grid font-medium text-foreground tabular-nums *:col-start-1 *:row-start-1">
                  <span
                    aria-hidden
                    className="text-end transition-[opacity,translate,filter] duration-200 motion-reduce:transition-none group-hover/forecast-row:-translate-y-1 group-hover/forecast-row:opacity-0 group-hover/forecast-row:blur-[2px]"
                  >
                    {format(value)}
                  </span>
                  <span className="translate-y-1 text-end opacity-0 blur-[2px] transition-[opacity,translate,filter] duration-200 motion-reduce:transition-none group-hover/forecast-row:translate-y-0 group-hover/forecast-row:opacity-100 group-hover/forecast-row:blur-none">
                    <span className="sr-only">{format(providerSoFar)} so far, </span>
                    <span aria-hidden>{format(providerSoFar)}</span>
                  </span>
                  <span className="sr-only">{format(value)} projected</span>
                </span>
              </li>
            ))}
            <li
              aria-hidden
              className="text-[11px] text-muted-foreground opacity-0 transition-opacity duration-200 motion-reduce:transition-none group-hover/forecast-row:opacity-100"
            >
              so far
            </li>
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** Same footprint as the loaded forecast so the month figures do not push Totals around. */
export function UsageForecastSkeleton() {
  return (
    <section aria-label="Month-end forecast" aria-busy className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">This month</h2>
        <Skeleton className="h-3.5 w-36" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-7 w-24" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <Skeleton className="h-3.5 w-10" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
        <Skeleton shape="pill" className="h-2 w-full" />
        <div className="flex gap-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
    </section>
  );
}
