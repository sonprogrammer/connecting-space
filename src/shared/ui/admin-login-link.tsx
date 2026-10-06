"use client";

import { useEffect, useState } from "react";

import { getAdminLoginHref } from "@/shared/lib/auth/admin-login-redirect";

export function AdminLoginLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [href, setHref] = useState(() => getAdminLoginHref());

  useEffect(() => {
    queueMicrotask(() => {
      setHref(getAdminLoginHref(window.location.pathname, window.location.search));
    });
  }, []);

  return <a href={href} className={className}>{children}</a>;
}
