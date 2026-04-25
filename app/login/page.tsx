"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Input } from "@/components/Input";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/Button";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = React.useState<string | null>(null);

  function validate() {
    const errs: { email?: string; password?: string } = {};
    if (!email) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Enter a valid email";
    }
    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 6) {
      errs.password = "Must be at least 6 characters";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError(null);
    setServerSuccess(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data?.error || "Login failed");
        return;
      }
      setServerSuccess("Signed in successfully");
      const next = searchParams.get("next");
      const safeNext = next && next.startsWith("/") ? next : null;
      const dest = safeNext || "/";
      window.location.assign(dest);
      // Optionally redirect after success
      // window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[70vh] px-4 py-10 sm:py-16">
      <AuthCard
        title="Welcome back"
        subtitle={<span>Don't have an account? <Link className="text-blue-600 hover:underline" href="/signup">Sign up</Link></span>}
      >
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            error={errors.email}
            autoComplete="email"
            required
          />
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            error={errors.password}
            autoComplete="current-password"
            required
          />
          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          {serverSuccess ? <p className="text-sm text-green-600">{serverSuccess}</p> : null}
          <div className="pt-2">
            <Button type="submit" loading={loading} className="w-full">Sign in</Button>
          </div>
        </form>
      </AuthCard>
    </main>
  );
}
