import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { IconButton, Searchbar, type SearchbarProps } from "react-native-paper";
import { Camera, ScanBarcode, Search, Sparkles, X } from "lucide-react-native";
import { CameraScanModal } from "./CameraScanModal";
import { VisualScanModal } from "../../features/asistente-ia/components/VisualScanModal";
import type { VisualMatchCandidate } from "../types/domain";
import { colors } from "../theme";

export interface AppSearchbarProps extends Omit<SearchbarProps, "icon" | "clearIcon" | "right"> {
  value: string;
  onChangeText: (query: string) => void;
  onScan?: (code: string) => void;
  onSelectVisualProduct?: (candidate: VisualMatchCandidate) => void;
  scanTitle?: string;
  showCamera?: boolean;
  showVisualAI?: boolean;
}

/**
 * Buscador estándar de la aplicación con escaneo óptico (código de barras)
 * y reconocimiento visual multimodal con IA (RF-25) integrados.
 */
export function AppSearchbar({
  value,
  onChangeText,
  onScan,
  onSelectVisualProduct,
  scanTitle,
  showCamera = true,
  showVisualAI = true,
  placeholder = "Buscar...",
  style,
  ...rest
}: AppSearchbarProps) {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [visualModalVisible, setVisualModalVisible] = useState(false);

  const handleScan = (scannedCode: string) => {
    onChangeText(scannedCode);
    onScan?.(scannedCode);
  };

  const handleVisualSelect = (candidate: VisualMatchCandidate) => {
    onChangeText(candidate.codigo);
    if (onSelectVisualProduct) {
      onSelectVisualProduct(candidate);
    } else {
      onScan?.(candidate.codigo);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Searchbar
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        icon={() => <Search size={20} color={colors.textSecondary} />}
        style={[styles.searchbar, style]}
        right={() => (
          <View style={styles.rightActions}>
            {value ? (
              <IconButton
                icon={() => <X size={18} color={colors.textSecondary} />}
                onPress={() => onChangeText("")}
                size={20}
                style={styles.iconBtn}
                accessibilityLabel="Borrar búsqueda"
              />
            ) : null}
            {showVisualAI ? (
              <IconButton
                icon={() => <Sparkles size={18} color={colors.primary} />}
                onPress={() => setVisualModalVisible(true)}
                size={20}
                style={styles.iconBtn}
                accessibilityLabel="Identificar con IA"
              />
            ) : null}
            {showCamera ? (
              <IconButton
                icon={() => <ScanBarcode size={20} color={colors.primary} />}
                onPress={() => setScannerVisible(true)}
                size={20}
                style={styles.iconBtn}
                accessibilityLabel="Escanear código de barras"
              />
            ) : null}
          </View>
        )}
        {...rest}
      />

      <CameraScanModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleScan}
        title={scanTitle ?? "Escanear para buscar"}
      />

      <VisualScanModal
        visible={visualModalVisible}
        onClose={() => setVisualModalVisible(false)}
        onSelectProduct={handleVisualSelect}
        title="Identificar prenda con IA"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  searchbar: {
    backgroundColor: colors.surface,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
  iconBtn: {
    margin: 0,
  },
});
