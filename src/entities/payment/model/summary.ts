import type {
  PaymentReceiptSummaryInput,
  PaymentSummaryInput,
  ProjectPaymentSummary,
} from "./types";

export function calculateProjectPaymentSummary(
  projectContractAmount: number,
  payments: PaymentSummaryInput[],
  receipts: PaymentReceiptSummaryInput[],
): ProjectPaymentSummary {
  const receivedByPayment = new Map<string, number>();
  for (const receipt of receipts) {
    receivedByPayment.set(
      receipt.payment_id,
      (receivedByPayment.get(receipt.payment_id) ?? 0) + receipt.amount,
    );
  }

  const activePayments = payments.filter((payment) => payment.status !== "cancelled");
  const confirmedRevenue = activePayments.reduce((total, payment) => total + payment.amount, 0);
  const expectedRevenue =
    projectContractAmount +
    activePayments
      .filter((payment) => payment.kind === "extra")
      .reduce((total, payment) => total + payment.amount, 0);
  const receivedTotal = receipts.reduce((total, receipt) => total + receipt.amount, 0);

  return {
    expectedRevenue,
    confirmedRevenue,
    receivedTotal,
    outstanding: Math.max(confirmedRevenue - receivedTotal, 0),
    payments: payments.map((payment) => {
      const receivedAmount = receivedByPayment.get(payment.id) ?? 0;
      return {
        paymentId: payment.id,
        receivedAmount,
        outstandingAmount:
          payment.status === "cancelled" ? 0 : Math.max(payment.amount - receivedAmount, 0),
      };
    }),
  };
}
