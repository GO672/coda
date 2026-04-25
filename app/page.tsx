"use client";
import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [isAuthed, setIsAuthed] = React.useState(false);
  const [showStudentJoin, setShowStudentJoin] = React.useState(false);
  const [inviteInput, setInviteInput] = React.useState("");
  const [inviteError, setInviteError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => setIsAuthed(r.ok))
      .catch(() => setIsAuthed(false));
  }, []);

  function openStudentJoin() {
    setInviteInput("");
    setInviteError(null);
    setShowStudentJoin(true);
  }

  function extractInviteCode(raw: string) {
    const s = raw.trim();
    if (!s) return null;

    const maybeCode = s.toUpperCase().replace(/\s+/g, "");
    if (/^[A-Z0-9]{6}$/.test(maybeCode)) return maybeCode;

    try {
      const url = new URL(s);
      const code = url.searchParams.get("code");
      if (code) {
        const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
        if (/^[A-Z0-9]{6}$/.test(normalized)) return normalized;
      }
    } catch {}

    const match = maybeCode.match(/[A-Z0-9]{6}/);
    return match ? match[0] : null;
  }

  function submitStudentJoin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = extractInviteCode(inviteInput);
    if (!code) {
      setInviteError("Enter a valid invite code or link");
      return;
    }

    const nextPath = `/join?code=${encodeURIComponent(code)}`;
    setShowStudentJoin(false);

    if (!mounted) {
      router.push("/login");
      return;
    }

    if (!isAuthed) {
      router.push(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    router.push(nextPath);
  }

  return (
    <div className="relative min-h-dvh overflow-hidden text-white">

      <div className="mx-auto max-w-6xl px-6 py-14">
        <header className="mt-4 sm:mt-6 mb-14">
          <div className="flex flex-col items-center gap-16 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 ring-1 ring-white/10">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-sm text-white/80">Real-time collaborative coding for education</span>
            </div>

            <h1 className="text-balance text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight">
              Learn faster with live coding support
            </h1>

            <p className="mx-auto max-w-2xl text-base sm:text-lg text-white/70">
              Create an account, join as a student or instructor, and collaborate in real time.
            </p>
          </div>
        </header>

        <section className="grid justify-center gap-10 sm:grid-cols-2">
          <div className="ml-auto w-full max-w-md transform-gpu rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-xl hover:shadow-sky-500/10 hover:ring-sky-400/30">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-sky-900/40 ring-1 ring-sky-500/20">
              <span className="text-2xl">🧭</span>
            </div>
            <h2 className="text-2xl font-semibold">Student</h2>
            <p className="mt-2 text-white/70">
              Work on coding exercises, collaborate with peers, and get real-time help from instructors.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-sky-400" />Access coding exercises</li>
              <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-sky-400" />Raise hand for help</li>
              <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-sky-400" />Real-time code collaboration</li>
            </ul>
            <div className="mt-8">
              <button
                type="button"
                onClick={openStudentJoin}
                className="block w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 text-center text-sm font-semibold text-white shadow-md shadow-sky-950/40 ring-1 ring-white/10 hover:opacity-95"
              >
                Continue as Student
              </button>
            </div>
          </div>

          <div className="mr-auto w-full max-w-md transform-gpu rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-xl hover:shadow-fuchsia-500/10 hover:ring-fuchsia-400/30">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-fuchsia-900/40 ring-1 ring-fuchsia-500/20">
              <span className="text-2xl">⚡</span>
            </div>
            <h2 className="text-2xl font-semibold">Instructor</h2>
            <p className="mt-2 text-white/70">
              Manage classes, monitor student progress, and provide real-time guidance in private sessions.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-fuchsia-400" />Manage student classes</li>
              <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-fuchsia-400" />Monitor student progress</li>
              <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-fuchsia-400" />One-on-one private sessions</li>
            </ul>
            <div className="mt-8">
              <Link
                href={
                  !mounted
                    ? "/login"
                    : isAuthed
                      ? "/instructor"
                      : "/login?next=/instructor"
                }
                className="block w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-rose-500 px-6 py-3 text-center text-sm font-semibold text-white shadow-md shadow-fuchsia-950/40 ring-1 ring-white/10 hover:opacity-95"
              >
                Continue as Instructor
              </Link>
            </div>
          </div>
        </section>

        <footer className="mt-14 text-center text-sm text-white/50">
          <span>By continuing, you agree to use this platform for educational purposes.</span>
        </footer>
      </div>

      {showStudentJoin ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowStudentJoin(false)} />
          <div className="absolute inset-0 flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-lg rounded-2xl bg-zinc-950 p-6 ring-1 ring-white/10 shadow-2xl shadow-black/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">Join a classroom</h3>
                  <p className="mt-1 text-sm text-white/60">Paste the invite code or invite link from your instructor.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStudentJoin(false)}
                  className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={submitStudentJoin}>
                <div>
                  <label className="block text-sm font-semibold text-white">Invite code or link</label>
                  <input
                    value={inviteInput}
                    onChange={(e) => {
                      setInviteInput(e.target.value);
                      setInviteError(null);
                    }}
                    placeholder="ABC123 or https://.../join?code=ABC123"
                    className="mt-2 w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                    autoFocus
                  />
                  {inviteError ? <p className="mt-2 text-sm text-red-300">{inviteError}</p> : null}
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-sky-950/40 ring-1 ring-white/10 hover:opacity-95"
                >
                  Continue
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
