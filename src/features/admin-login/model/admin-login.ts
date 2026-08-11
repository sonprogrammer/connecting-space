import type { AdminLoginInput } from "@/features/admin-auth/schemas/admin-login.schema";
import type { ApiResponse } from "@/shared/types/api";

type AdminLoginResponse = {
  user: {
    id: string;
    email?: string;
  };
};

export type AdminLoginFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export type AdminLoginResult =
  | { ok: true }
  | { ok: false; message: string };

export async function requestAdminLogin(
  input: AdminLoginInput,
  fetcher: AdminLoginFetcher = fetch,
): Promise<AdminLoginResult> {
  try {
    const response = await fetcher("/api/auth/login", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const result = (await response.json()) as ApiResponse<AdminLoginResponse>;

    if (response.ok && !("error" in result)) {
      return { ok: true };
    }

    if ("error" in result) {
      if (result.error.code === "LOGIN_FAILED") {
        return {
          ok: false,
          message: "이메일 또는 비밀번호가 올바르지 않습니다.",
        };
      }

      if (result.error.code === "VALIDATION_ERROR") {
        return {
          ok: false,
          message: "이메일 형식과 8자 이상의 비밀번호를 확인해 주세요.",
        };
      }

      if (result.error.code === "ADMIN_AUTH_REQUIRED") {
        return {
          ok: false,
          message: "관리자 권한이 있는 계정으로 로그인해 주세요.",
        };
      }
    }

    return {
      ok: false,
      message: "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  } catch {
    return {
      ok: false,
      message:
        "로그인 중 네트워크 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function submitAdminLogin(
  input: AdminLoginInput,
  navigate: (destination: string) => void,
  fetcher: AdminLoginFetcher = fetch,
): Promise<AdminLoginResult> {
  const result = await requestAdminLogin(input, fetcher);

  if (result.ok) {
    navigate("/admin");
  }

  return result;
}
