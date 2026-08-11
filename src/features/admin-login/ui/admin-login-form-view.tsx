import type { FormEventHandler } from "react";
import { AlertCircle, Loader2, LogIn } from "lucide-react";

export type AdminLoginFormViewProps = {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  isSubmitting: boolean;
  errorMessage: string | null;
};

export function AdminLoginFormView({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  isSubmitting,
  errorMessage,
}: AdminLoginFormViewProps) {
  return (
    <section className="p-8 sm:p-10">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-semibold text-[#2e6f4f]">Admin Login</p>
        <h2 className="mt-3 text-2xl font-semibold">관리자 로그인</h2>
        <p className="mt-2 text-sm leading-6 text-[#617068]">
          관리자 계정으로 로그인하면 운영 대시보드로 이동합니다.
        </p>

        <form className="mt-8 space-y-5" method="post" onSubmit={onSubmit}>
          <label className="block text-sm font-medium" htmlFor="admin-email">
            이메일
          </label>
          <input
            id="admin-email"
            className="-mt-3 h-11 w-full rounded-md border border-[#d8d1c6] bg-white px-3 text-base outline-none transition focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:cursor-not-allowed disabled:bg-[#f0f2ee]"
            name="email"
            placeholder="admin@example.com"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            disabled={isSubmitting}
            required
          />

          <label className="block text-sm font-medium" htmlFor="admin-password">
            비밀번호
          </label>
          <input
            id="admin-password"
            className="-mt-3 h-11 w-full rounded-md border border-[#d8d1c6] bg-white px-3 text-base outline-none transition focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:cursor-not-allowed disabled:bg-[#f0f2ee]"
            name="password"
            placeholder="비밀번호"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            disabled={isSubmitting}
            minLength={8}
            required
          />

          {errorMessage ? (
            <div
              role="alert"
              className="flex gap-2 rounded-md bg-[#fff1ee] p-3 text-sm leading-6 text-[#912018]"
            >
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {errorMessage}
            </div>
          ) : null}

          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#17201a] px-4 text-sm font-semibold text-white transition hover:bg-[#2b3931] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                로그인 중
                <Loader2 aria-hidden className="size-4 animate-spin" />
              </>
            ) : (
              <>
                로그인
                <LogIn aria-hidden className="size-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
