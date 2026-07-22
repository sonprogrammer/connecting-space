import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imweb Ops MVP",
  description: "아임웹 제작 대행 운영을 위한 공개 홈페이지와 관리자 UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
