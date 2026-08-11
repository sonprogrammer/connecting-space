"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { submitAdminLogin } from "../model/admin-login";
import { AdminLoginFormView } from "./admin-login-form-view";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await submitAdminLogin(
      { email, password },
      (destination) => router.replace(destination),
    );

    if (!result.ok) {
      setErrorMessage(result.message);
      setIsSubmitting(false);
      return;
    }
  }

  return (
    <AdminLoginFormView
      email={email}
      password={password}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
    />
  );
}
