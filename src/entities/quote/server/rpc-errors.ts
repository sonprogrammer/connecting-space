type RpcError = { code?: string; message?: string } | null;

export type QuoteApiError = {
  code: string;
  message: string;
  status: number;
};

export function mapQuoteRpcError(error: RpcError): QuoteApiError {
  if (error?.code === "P0002") {
    return { code: "QUOTE_NOT_FOUND", message: "Quote not found", status: 404 };
  }
  if (error?.code === "23503") {
    return { code: "QUOTE_REFERENCE_NOT_FOUND", message: "Referenced record not found", status: 404 };
  }
  if (error?.code === "P0001" || error?.code === "23505" || error?.code === "55000") {
    return { code: "QUOTE_STATE_CONFLICT", message: "Quote state conflict", status: 409 };
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return { code: "INVALID_QUOTE_INPUT", message: "Invalid quote input", status: 400 };
  }
  return { code: "QUOTE_OPERATION_FAILED", message: "Quote operation failed", status: 500 };
}
