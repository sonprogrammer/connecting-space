export function AdminMobileHeader({
  title,
  menu,
}: {
  title: string;
  menu: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--admin-border)] bg-[var(--admin-surface)]/95 px-4 backdrop-blur md:hidden">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[var(--admin-text-muted)]">Connecting Space</p>
        <h1 className="truncate text-base font-bold text-[var(--admin-text)]">{title}</h1>
      </div>
      {menu}
    </header>
  );
}
