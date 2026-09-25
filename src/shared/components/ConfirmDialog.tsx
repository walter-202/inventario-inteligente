import { useCallback, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { Button, Dialog, Text } from "react-native-paper";
import { AppModalOverlay } from "./AppModalOverlay";
import { colors } from "../theme";

export interface ConfirmConfig {
  title: string;
  /** Qué se va a destruir y por qué no se puede deshacer. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Defecto: acción destructiva en rojo. */
  danger?: boolean;
}

interface PendingConfirm extends Required<Pick<ConfirmConfig, "title" | "message">> {
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

/**
 * Patrón único de confirmación para acciones destructivas en toda la app
 * (borrar chats, claves de IA, líneas del carrito...). Un error de dedo no
 * debería destruir datos sin una segunda confirmación explícita.
 *
 * Uso:
 * ```tsx
 * const { requestConfirm, dialog } = useConfirm();
 * const borrar = async () => {
 *   if (await requestConfirm({ title: "Borrar chat", message: "Se pierde el historial." })) {
 *     // ...borrar de verdad
 *   }
 * };
 * return <>{dialog}</>;
 * ```
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setPending(null);
  }, []);

  const requestConfirm = useCallback(
    (config: ConfirmConfig): Promise<boolean> =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setPending({
          title: config.title,
          message: config.message,
          confirmLabel: config.confirmLabel ?? "Borrar",
          cancelLabel: config.cancelLabel ?? "Cancelar",
          danger: config.danger ?? true,
        });
      }),
    [],
  );

  const dialog = (
    <AppModalOverlay visible={pending !== null} onDismiss={() => settle(false)}>
      <Dialog visible={pending !== null} onDismiss={() => settle(false)} style={styles.dialog}>
        {pending ? (
          <>
            <Dialog.Title style={pending.danger ? styles.dangerTitle : undefined}>{pending.title}</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium" style={styles.message}>
                {pending.message}
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => settle(false)}>{pending.cancelLabel}</Button>
              <Button
                mode="contained"
                buttonColor={pending.danger ? colors.danger : undefined}
                onPress={() => settle(true)}
              >
                {pending.confirmLabel}
              </Button>
            </Dialog.Actions>
          </>
        ) : null}
      </Dialog>
    </AppModalOverlay>
  );

  return { requestConfirm, dialog };
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 16 },
  dangerTitle: { color: colors.danger },
  message: { lineHeight: 22 },
});
