"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fromUrl = searchParams.get("code") || "";
    if (fromUrl) setCode(fromUrl.toUpperCase());
  }, [searchParams]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Invitation code is required");
      return;
    }
    setError(null);
    router.push(`/student?code=${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">

      <div className="mx-auto max-w-xl px-6 py-16">
        <header className="mt-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Join a classroom</h1>
          <p className="mt-2 text-white/70">Paste the invitation code your instructor sent you.</p>
        </header>

        <div className="mt-10 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-white">Invitation code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. A2B3C4"
                className="mt-2 w-full rounded-xl bg-white/5 px-4 py-3 font-mono text-sm tracking-widest text-white placeholder:text-white/35 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              />
              {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-sky-950/40 ring-1 ring-white/10 hover:opacity-95"
            >
              Join as Student
            </button>

            <div className="pt-2 text-center">
              <Link href="/" className="text-sm text-white/70 hover:text-white">
                Back to home
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
