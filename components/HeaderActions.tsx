"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function HeaderActions() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthed, setIsAuthed] = React.useState(false);
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") {
      setIsDark(false);
      document.documentElement.classList.add("light");
    }
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  }

  React.useEffect(() => {
    const sync = () => {
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => {
          setIsAuthed(r.ok);
        })
        .catch(() => setIsAuthed(false));
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  React.useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        setIsAuthed(r.ok);
      })
      .catch(() => setIsAuthed(false));
  }, [pathname]);

  function logout() {
    fetch("/api/auth/logout", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        setIsAuthed(false);
        router.replace("/");
        router.refresh();
      });
  }

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-full bg-black/30 p-2.5 text-white backdrop-blur-md ring-1 ring-white/10 hover:bg-black/40 transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      )}
    </button>
  );

  if (isAuthed) {
    return (
      <div className="flex items-center gap-2">
        {themeButton}
        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-full bg-black/30 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md ring-1 ring-white/10 hover:bg-black/40"
        >
          Profile
        </Link>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center justify-center rounded-full bg-black/30 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md ring-1 ring-white/10 hover:bg-black/40"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {themeButton}
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-full bg-black/30 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md ring-1 ring-white/10 hover:bg-black/40"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-950/40 ring-1 ring-white/10 hover:opacity-95"
      >
        Sign up
      </Link>
    </div>
  );
}
