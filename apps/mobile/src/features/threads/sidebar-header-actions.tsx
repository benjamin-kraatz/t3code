import { SymbolView } from "../../components/AppSymbol";
import { Pressable, View } from "react-native";
import { PaceWarningDot } from "../usage/PaceWarningDot";

export interface SidebarHeaderActionsProps {
  readonly onOpenSettings: () => void;
  readonly hasPaceWarning: boolean;
}

function FallbackHeaderButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: "gearshape" | "square.and.pencil";
  readonly onPress: () => void;
  readonly badge?: boolean;
}) {
  return (
    <Pressable
      className="size-11 items-center justify-center rounded-full bg-subtle active:opacity-70"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
      onPress={props.onPress}
    >
      <SymbolView
        name={props.icon}
        size={18}
        tintColorClassName="accent-foreground"
        type="monochrome"
      />
      {props.badge ? (
        <View pointerEvents="none" className="absolute top-1 right-1">
          <PaceWarningDot />
        </View>
      ) : null}
    </Pressable>
  );
}

export function SidebarHeaderActions(props: SidebarHeaderActionsProps) {
  return (
    <View className="flex-row items-center gap-0.5">
      <FallbackHeaderButton
        accessibilityLabel={props.hasPaceWarning ? "Open settings, usage warning" : "Open settings"}
        icon="gearshape"
        onPress={props.onOpenSettings}
        badge={props.hasPaceWarning}
      />
    </View>
  );
}
