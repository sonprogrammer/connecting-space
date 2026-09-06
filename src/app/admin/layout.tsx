import { AdminQueryProvider } from "./admin-query-provider";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AdminQueryProvider>
      <div className="min-h-screen bg-[#f5f6f3]">{children}</div>
    </AdminQueryProvider>
  );
}
