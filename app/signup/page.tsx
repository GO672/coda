"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Input } from "@/components/Input";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/Button";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ username?: string; name?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = React.useState<string | null>(null);

  function validate() {
    const errs: { username?: string; name?: string; email?: string; password?: string; confirmPassword?: string } = {};
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!username) {
      errs.username = "Username is required";
    } else if (!usernameRegex.test(username)) {
      errs.username = "3-20 chars: letters, numbers, underscores";
    }
    if (!name) errs.name = "Name is required";
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
    if (!confirmPassword) {
      errs.confirmPassword = "Confirm your password";
    } else if (confirmPassword !== password) {
      errs.confirmPassword = "Passwords do not match";
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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data?.error || "Signup failed");
        return;
      }
      setServerSuccess("Account created. You can now sign in.");
      router.replace("/");
      // Optionally redirect after success
      // window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[70vh] px-4 py-10 sm:py-16">
      <AuthCard
        title="Create your account"
        subtitle={<span>Already have an account? <Link className="text-blue-600 hover:underline" href="/login">Sign in</Link></span>}
      >
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            error={errors.username}
            autoComplete="username"
            required
          />
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            error={errors.name}
            autoComplete="name"
            required
          />
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
            autoComplete="new-password"
            required
          />
          <PasswordInput
            label="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            error={errors.confirmPassword}
            autoComplete="new-password"
            required
          />
          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          {serverSuccess ? <p className="text-sm text-green-600">{serverSuccess}</p> : null}
          <div className="pt-2">
            <Button type="submit" loading={loading} className="w-full">Create account</Button>
          </div>
        </form>
      </AuthCard>
    </main>
  );
}
