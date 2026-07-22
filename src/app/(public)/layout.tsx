import Link from "next/link";

import { buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[#e4ded3] bg-white/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="text-base font-semibold text-[#17201a]">
            Imweb Ops
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-[#526057] md:flex">
            <Link href="/#services">서비스</Link>
            <Link href="/#process">제작 과정</Link>
            <Link href="/#pricing">가격</Link>
            <Link href="/#faq">FAQ</Link>
          </div>
          <Link
            href="/#inquiry"
            className={cn(buttonVariants({ size: "sm" }), "px-3")}
          >
            제작 문의
          </Link>
        </nav>
      </header>
      {children}
      <footer className="border-t border-[#e4ded3] bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-[#617068] sm:flex-row sm:items-center sm:justify-between">
          <p>Imweb Ops MVP</p>
          <p>상담, 제작, 오픈 운영을 위한 공개 홈페이지 기본 화면</p>
        </div>
      </footer>
    </>
  );
}
