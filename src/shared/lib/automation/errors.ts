export function nextFailureState(attemptCount: number, maxAttempts: number, now = new Date()) {
  if (attemptCount >= maxAttempts) return { status: "failed" as const, availableAt: null };
  const delayMinutes = 2 ** Math.max(0, attemptCount - 1);
  return { status: "retry" as const, availableAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString() };
}

export function redactAutomationError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Automation failed";
  return raw
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/https:\/\/hooks\.slack\.com\/\S+/gi, "[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted]")
    .replace(/01[016789][- ]?\d{3,4}[- ]?\d{4}/g, "[redacted]")
    .slice(0, 500);
}
