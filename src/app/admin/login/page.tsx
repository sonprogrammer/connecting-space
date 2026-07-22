import { AdminLoginForm } from "@/features/admin-login";

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-[#f4f1ec] px-5 py-8 text-[#17201a] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-[#d9d2c7] bg-white shadow-sm lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex min-h-[440px] flex-col justify-between bg-[#14261f] p-8 text-white sm:p-10">
            <div>
              <p className="text-sm font-medium text-[#a8d5ba]">Imweb Ops Admin</p>
              <h1 className="mt-6 max-w-md text-3xl font-semibold leading-tight sm:text-4xl">
                문의부터 입금까지 한 화면에서 운영하는 관리자 공간
              </h1>
            </div>
            <div className="grid gap-3 text-sm text-[#d7e5dc] sm:grid-cols-3">
              <div>
                <strong className="block text-2xl text-white">24h</strong>
                신규 문의 확인
              </div>
              <div>
                <strong className="block text-2xl text-white">7건</strong>
                이번 주 상담
              </div>
              <div>
                <strong className="block text-2xl text-white">3개</strong>
                진행 프로젝트
              </div>
            </div>
          </section>
          <AdminLoginForm />
        </div>
      </div>
    </main>
  );
}
