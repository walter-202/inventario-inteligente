import { Badge } from "react-native-paper";
import { colors } from "../theme";

type Status = "success" | "warning" | "danger" | "info" | "neutral";
const palette: Record<Status, { backgroundColor: string; color: string }> = {
  success: { backgroundColor: colors.successSoft, color: colors.success },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  info: { backgroundColor: colors.infoSoft, color: colors.info },
  neutral: { backgroundColor: colors.surfaceSecondary, color: colors.textSecondary },
};

export function StatusBadge({ label, status = "neutral" }: { label: string; status?: Status }) {
  const selected = palette[status];
  return (
    <Badge
      style={{
        backgroundColor: selected.backgroundColor,
        color: selected.color,
        paddingHorizontal: 8,
        minWidth: 0,
      }}
    >
      {label}
    </Badge>
  );
}
