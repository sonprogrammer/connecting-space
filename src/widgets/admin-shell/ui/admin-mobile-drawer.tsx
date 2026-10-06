"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";

import { AdminThemeControl } from "./admin-theme-control";
import { AdminNavigationMenu } from "./admin-sidebar";

export function AdminMobileDrawer({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal>
      <Dialog.Trigger
        ref={triggerRef}
        aria-label="관리자 메뉴 열기"
        className="grid size-11 place-items-center rounded-xl border border-[var(--admin-border)] text-[var(--admin-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/55 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          initialFocus={firstLinkRef}
          finalFocus={triggerRef}
          className="admin-drawer fixed inset-y-0 right-0 z-50 flex w-[min(88vw,22rem)] flex-col overflow-y-auto border-l border-[var(--admin-border)] bg-[var(--admin-canvas)] p-5 text-[var(--admin-text)] shadow-2xl transition-transform data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold">관리자 메뉴</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--admin-text-muted)]">
                필요한 관리 화면으로 이동하세요.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="관리자 메뉴 닫기"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--admin-border)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <AdminNavigationMenu
            pathname={pathname}
            compact
            firstLinkRef={firstLinkRef}
            onNavigate={() => setOpen(false)}
          />
          <div className="mt-auto pt-8">
            <AdminThemeControl />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
