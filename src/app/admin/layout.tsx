import { AdminQueryProvider } from "./admin-query-provider";
import { AdminShell, AdminThemeProvider } from "@/widgets/admin-shell";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AdminThemeProvider>
      <AdminQueryProvider>
        <AdminShell>{children}</AdminShell>
      </AdminQueryProvider>
    </AdminThemeProvider>
  );
}
