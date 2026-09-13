type PaymentOverrides = {
  totalAmount: number;
  confirmedDate: string;
  estimatedEndDate: string | null;
  depositPercentage?: number;
  balancePercentage?: number;
  depositAmount?: number;
  balanceAmount?: number;
  depositDueDate?: string | null;
  balanceDueDate?: string | null;
};

export function calculateContractPayments(input: PaymentOverrides) {
  const hasPercent = input.depositPercentage !== undefined || input.balancePercentage !== undefined;
  const hasAmount = input.depositAmount !== undefined || input.balanceAmount !== undefined;
  if (hasPercent && (input.depositPercentage === undefined || input.balancePercentage === undefined)) throw new Error("PAYMENT_PERCENTAGE_OVERRIDE_REQUIRED");
  if (hasAmount && (input.depositAmount === undefined || input.balanceAmount === undefined)) throw new Error("PAYMENT_AMOUNT_OVERRIDE_REQUIRED");
  if (hasPercent && input.depositPercentage! + input.balancePercentage! !== 100) throw new Error("PAYMENT_PERCENTAGE_OVERRIDE_INVALID");
  const depositAmount = hasAmount ? input.depositAmount! : Math.floor(input.totalAmount * (input.depositPercentage ?? 30) / 100);
  const balanceAmount = hasAmount ? input.balanceAmount! : input.totalAmount - depositAmount;
  if (depositAmount < 0 || balanceAmount < 0 || depositAmount + balanceAmount !== input.totalAmount) throw new Error("PAYMENT_AMOUNT_OVERRIDE_INVALID");
  if (hasPercent && hasAmount && depositAmount !== Math.floor(input.totalAmount * input.depositPercentage! / 100)) throw new Error("PAYMENT_OVERRIDE_INCONSISTENT");
  return {
    depositAmount,
    balanceAmount,
    depositDueDate: input.depositDueDate ?? input.confirmedDate,
    balanceDueDate: input.balanceDueDate ?? input.estimatedEndDate,
  };
}
