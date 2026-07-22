import { LogIn } from "lucide-react";

import { Button } from "@/shared/ui/button";

export function AdminLoginForm() {
  return (
    <section className="p-8 sm:p-10">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-semibold text-[#2e6f4f]">Admin Login</p>
        <h2 className="mt-3 text-2xl font-semibold">관리자 로그인</h2>
        <p className="mt-2 text-sm leading-6 text-[#617068]">
          인증 서버 로직은 백엔드 세션에서 Supabase Auth로 연결합니다.
        </p>

        <form className="mt-8 space-y-5" action="/admin">
          <label className="block text-sm font-medium">
            이메일
            <input
              className="mt-2 h-11 w-full rounded-md border border-[#d8d1c6] bg-white px-3 text-base outline-none transition focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15"
              name="email"
              placeholder="admin@example.com"
              type="email"
            />
          </label>
          <label className="block text-sm font-medium">
            비밀번호
            <input
              className="mt-2 h-11 w-full rounded-md border border-[#d8d1c6] bg-white px-3 text-base outline-none transition focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15"
              name="password"
              placeholder="비밀번호"
              type="password"
            />
          </label>
          <Button className="h-11 w-full" type="submit">
            로그인 화면 확인
            <LogIn aria-hidden className="size-4" />
          </Button>
        </form>
      </div>
    </section>
  );
}
