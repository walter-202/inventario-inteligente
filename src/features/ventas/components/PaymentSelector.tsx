import { SegmentedButtons } from "react-native-paper";
import { type PaymentMethod, PAYMENT_METHODS } from "../../../shared/types/domain";

export function PaymentSelector({ value, onChange }: { value: PaymentMethod; onChange: (value: PaymentMethod) => void }) {
  const labels: Record<PaymentMethod, string> = {
    efectivo: "Efectivo",
    QR: "QR",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
  };
  return (
    <SegmentedButtons
      value={value}
      onValueChange={(next) => {
        if ((PAYMENT_METHODS as readonly string[]).includes(next)) onChange(next as PaymentMethod);
      }}
      buttons={PAYMENT_METHODS.map((method) => ({
        value: method,
        label: labels[method],
        showSelectedCheck: false,
      }))}
    />
  );
}
