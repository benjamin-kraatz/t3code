import type { EnvironmentId } from "@t3tools/contracts";
import type { MergedUsage, ProjectTotals } from "@t3tools/shared/usageMerge";
import { formatPercent, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, ReduceMotion } from "react-native-reanimated";

import { AppText as Text } from "../../components/AppText";
import { ControlPillMenu } from "../../components/ControlPill";
import { RowPressable } from "../../components/RowPressable";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { SettingsSection } from "../settings/components/SettingsSection";
import type { UsageChartMetric } from "./usageChartData";

/** Past this many rows the long tail of scratch directories sits behind a toggle. */
const COLLAPSED_PROJECT_COUNT = 8;

const PATH_MENU_ACTIONS = [{ id: "copy-path", title: "Copy path", image: "doc.on.doc" }];

const SUBTITLE_ENTERING = FadeInDown.duration(220).reduceMotion(ReduceMotion.System);
const SUBTITLE_EXITING = FadeOutUp.duration(160).reduceMotion(ReduceMotion.System);

function isCostUnknown(project: ProjectTotals): boolean {
  return project.records > 0 && project.unpricedRecords >= project.records;
}

/**
 * One project line. A tap swaps the subtitle between totals and the absolute
 * path, sliding the outgoing line up as the next one rises in; a long press
 * offers to copy the path. Rows without a path stay static.
 */
function ProjectRow(props: {
  readonly project: ProjectTotals;
  readonly first: boolean;
  readonly title: string;
  readonly detail: string;
  readonly value: string;
}) {
  const { path } = props.project;
  const [showingPath, setShowingPath] = useState(false);
  const subtitle = showingPath && path !== null ? path : props.detail;
  const content = (
    <View
      className={
        props.first
          ? "flex-row items-center gap-3 p-4"
          : "flex-row items-center gap-3 border-t border-border-subtle p-4"
      }
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base text-foreground" numberOfLines={1}>
          {props.title}
        </Text>
        {/* The invisible line holds the height; the visible one animates over it. */}
        <View>
          <Text className="text-sm opacity-0" numberOfLines={1} aria-hidden>
            {" "}
          </Text>
          <Animated.View
            key={showingPath ? "path" : "detail"}
            entering={SUBTITLE_ENTERING}
            exiting={SUBTITLE_EXITING}
            className="absolute inset-x-0 top-0"
          >
            <Text
              className="text-sm text-foreground-muted"
              numberOfLines={1}
              ellipsizeMode={showingPath ? "middle" : "tail"}
            >
              {subtitle}
            </Text>
          </Animated.View>
        </View>
      </View>
      <Text className="text-base tabular-nums text-foreground">{props.value}</Text>
    </View>
  );
  if (path === null) return content;
  return (
    <ControlPillMenu
      actions={PATH_MENU_ACTIONS}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "copy-path") copyTextWithHaptic(path, { target: "project path" });
      }}
      shouldOpenOnLongPress
    >
      <RowPressable
        accessibilityRole="button"
        accessibilityLabel={`${props.title}, ${subtitle}, ${props.value}`}
        accessibilityHint={showingPath ? "Shows usage details" : "Shows the project path"}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => undefined);
          setShowingPath((value) => !value);
        }}
      >
        {content}
      </RowPressable>
    </ControlPillMenu>
  );
}

/**
 * Where the selected metric went, by project. Rows rank by whatever the metric
 * toggle shows, like the provider list, and each carries its share of the
 * headline total.
 */
export function UsageProjectsSection(props: {
  readonly merged: MergedUsage;
  readonly metric: UsageChartMetric;
  readonly environmentLabels: ReadonlyMap<EnvironmentId, string>;
}) {
  const { merged, metric } = props;
  const [expanded, setExpanded] = useState(false);
  if (merged.projects.length === 0) return null;

  // .sort() on a copy, not .toSorted(): Hermes doesn't ship the ES2023 method.
  const ordered = [...merged.projects].sort((a, b) =>
    metric === "cost"
      ? b.costUsd - a.costUsd || b.totalTokens - a.totalTokens
      : b.totalTokens - a.totalTokens || b.costUsd - a.costUsd,
  );
  const collapsible = ordered.length > COLLAPSED_PROJECT_COUNT + 1;
  const visible = collapsible && !expanded ? ordered.slice(0, COLLAPSED_PROJECT_COUNT) : ordered;
  // Same project title on two environments is ambiguous without the label.
  const showEnvironment =
    new Set(
      merged.projects.flatMap((project) =>
        project.environmentId === null ? [] : [project.environmentId],
      ),
    ).size > 1;

  return (
    <SettingsSection title="By project">
      {visible.map((project, index) => {
        const share = metric === "cost" ? project.costShare : project.tokenShare;
        const costUnknown = isCostUnknown(project);
        const qualifier =
          project.kind === "directory"
            ? "Outside T3"
            : showEnvironment && project.environmentId !== null
              ? (props.environmentLabels.get(project.environmentId) ?? null)
              : null;
        const detail =
          metric === "cost"
            ? costUnknown
              ? `no known rates · ${formatTokens(project.totalTokens)} tokens`
              : `${formatPercent(share)} of cost · ${formatTokens(project.totalTokens)} tokens`
            : `${formatPercent(share)} of tokens · ${costUnknown ? "unpriced" : formatUsd(project.costUsd)}`;
        return (
          <ProjectRow
            key={project.key}
            project={project}
            first={index === 0}
            title={project.title}
            detail={qualifier === null ? detail : `${qualifier} · ${detail}`}
            value={
              metric === "tokens"
                ? formatTokens(project.totalTokens)
                : costUnknown
                  ? "Unpriced"
                  : formatUsd(project.costUsd)
            }
          />
        );
      })}
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
          className="items-center border-t border-border-subtle p-4"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text className="text-sm font-t3-medium text-foreground-muted">
            {expanded
              ? "Show fewer projects"
              : `Show ${ordered.length - COLLAPSED_PROJECT_COUNT} more projects`}
          </Text>
        </Pressable>
      ) : null}
    </SettingsSection>
  );
}
