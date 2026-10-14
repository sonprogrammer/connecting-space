export type AdminQueryListState<T> =
  | { status: "loading" }
  | { status: "success"; items: T[]; warning?: string }
  | { status: "error"; message: string };
export type AdminQueryState<T> =
  | { status: "loading" }
  | { status: "success"; data: T; warning?: string }
  | { status: "error"; message: string };

const CACHED_REFRESH_WARNING =
  "목록을 새로고침하지 못했습니다. 현재 표시된 데이터는 이전 조회 결과입니다.";

export function getCachedQueryListState<T>({
  data,
  isPending,
  isError,
  errorMessage,
}: Readonly<{
  data: T[] | undefined;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
}>): AdminQueryListState<T> {
  if (data === undefined && isPending) return { status: "loading" };
  if (data === undefined && isError) {
    return { status: "error", message: errorMessage ?? "목록을 불러오지 못했습니다." };
  }
  return {
    status: "success",
    items: data ?? [],
    ...(isError ? { warning: CACHED_REFRESH_WARNING } : {}),
  };
}

export function getCachedQueryState<T>({
  data,
  isPending,
  isError,
  errorMessage,
  warningMessage = "최신 데이터를 불러오지 못했습니다. 이전 조회 데이터를 표시 중입니다.",
}: Readonly<{
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  warningMessage?: string;
}>): AdminQueryState<T> {
  if (data === undefined && isPending) return { status: "loading" };
  if (data === undefined) return { status: "error", message: errorMessage ?? "데이터를 불러오지 못했습니다." };
  return { status: "success", data, ...(isError ? { warning: warningMessage } : {}) };
}

export function syncEditableFormState<T extends object>({
  currentId,
  incomingId,
  current,
  baseline,
  incoming,
}: Readonly<{
  currentId: string | null;
  incomingId: string;
  current: T;
  baseline: T | null;
  incoming: T;
}>): { values: T; baseline: T } {
  if (currentId !== incomingId || baseline === null) {
    return { values: incoming, baseline: incoming };
  }

  const values = { ...incoming };
  for (const key of Object.keys(incoming) as Array<keyof T>) {
    if (current[key] !== baseline[key]) values[key] = current[key];
  }
  return { values, baseline: incoming };
}

export function areEditableFormValuesEqual<T extends object>(left: T, right: T): boolean {
  const keys = Object.keys(left) as Array<keyof T>;
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}
