import { Chip } from "react-native-paper";
import { Lightbulb } from "lucide-react-native";
import { ScrollView, StyleSheet } from "react-native";
import { spacing } from "../../../shared/theme";

export function SuggestionChips({ suggestions, onSelect }: { suggestions: string[]; onSelect: (value: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>{suggestions.map((suggestion) => <Chip key={suggestion} icon={() => <Lightbulb size={16} />} onPress={() => onSelect(suggestion)}>{suggestion}</Chip>)}</ScrollView>;
}
const styles = StyleSheet.create({ container: { gap: spacing.sm, paddingVertical: spacing.sm } });
