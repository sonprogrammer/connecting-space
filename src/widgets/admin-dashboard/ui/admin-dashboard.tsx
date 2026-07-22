import {
  ArrowUpRight,
  Banknote,
  ClipboardList,
  Clock3,
  FolderKanban,
  MessageSquareMore,
  UsersRound,
} from "lucide-react";

const stats = [
  { label: "신규 문의", value: "7", change: "+3 이번 주", icon: MessageSquareMore },
  { label: "진행 프로젝트", value: "3", change: "2건 제작 중", icon: FolderKanban },
  { label: "미수금", value: "320만원", change: "잔금 확인 필요", icon: Banknote },
  { label: "고객", value: "12", change: "활성 5팀", icon: UsersRound },
];

const inquiries = [
  { name: "로컬 필라테스", type: "브랜드 홈페이지", status: "상담 대기", budget: "180만원" },
  { name: "B2B 솔루션", type: "랜딩 페이지", status: "견적 발송", budget: "250만원" },
  { name: "카페 프랜차이즈", type: "리뉴얼", status: "자료 요청", budget: "협의" },
];

const tasks = [
  "필라테스 신규 문의 답변 초안 확인",
  "B2B 솔루션 견적서 발송 여부 체크",
  "진행 프로젝트 잔금 입금 예정일 입력",
];

export function AdminDashboard() {
  return (
    <main className="min-h-screen bg-[#f5f6f3] p-5 text-[#17201a] sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2e6f4f]">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">관리자 대시보드</h1>
            <p className="mt-2 text-sm text-[#617068]">
              문의, 고객, 프로젝트, 입금 상태를 빠르게 확인하는 기본 UI입니다.
            </p>
          </div>
          <div className="rounded-lg border border-[#d8d1c6] bg-white px-4 py-3 text-sm">
            <Clock3 aria-hidden className="mr-2 inline size-4 text-[#2e6f4f]" />
            오늘 확인할 항목 3개
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} className="rounded-lg border border-[#dfe3dc] bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#617068]">{stat.label}</p>
                  <Icon aria-hidden className="size-5 text-[#2e6f4f]" />
                </div>
                <strong className="mt-4 block text-3xl font-semibold">{stat.value}</strong>
                <p className="mt-2 text-sm text-[#617068]">{stat.change}</p>
              </article>
            );
          })}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <section className="rounded-lg border border-[#dfe3dc] bg-white">
            <div className="flex items-center justify-between border-b border-[#e8ebe5] p-5">
              <div>
                <h2 className="text-lg font-semibold">최근 문의</h2>
                <p className="mt-1 text-sm text-[#617068]">백엔드 연동 전 샘플 데이터입니다.</p>
              </div>
              <ArrowUpRight aria-hidden className="size-5 text-[#2e6f4f]" />
            </div>
            <div className="divide-y divide-[#edf0ea]">
              {inquiries.map((inquiry) => (
                <div key={inquiry.name} className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                  <div>
                    <p className="font-medium">{inquiry.name}</p>
                    <p className="mt-1 text-sm text-[#617068]">{inquiry.type}</p>
                  </div>
                  <span className="w-fit rounded-md bg-[#eaf3ed] px-2.5 py-1 text-sm font-medium text-[#23583f]">
                    {inquiry.status}
                  </span>
                  <p className="font-semibold">{inquiry.budget}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3dc] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-[#17201a] text-white">
                <ClipboardList aria-hidden className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">오늘 할 일</h2>
                <p className="text-sm text-[#617068]">운영 체크리스트</p>
              </div>
            </div>
            <ul className="mt-5 space-y-3">
              {tasks.map((task) => (
                <li key={task} className="rounded-md border border-[#e8ebe5] p-3 text-sm leading-6">
                  {task}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
