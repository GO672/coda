"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";

type UserProfile = {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);

  const [formName, setFormName] = React.useState("");
  const [formUsername, setFormUsername] = React.useState("");
  const [formEmail, setFormEmail] = React.useState("");

  React.useEffect(() => {
    fetch("/api/auth/profile", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          router.replace("/login");
          return;
        }
        const data = await r.json();
        const u = data.user as UserProfile;
        setUser(u);
        setFormName(u.name);
        setFormUsername(u.username);
        setFormEmail(u.email);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const r = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          username: formUsername,
          email: formEmail,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Failed to update profile");
        return;
      }
      const u = data.user as UserProfile;
      setUser(u);
      setFormName(u.name);
      setFormUsername(u.username);
      setFormEmail(u.email);
      setEditing(false);
      setSuccess("Profile updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (user) {
      setFormName(user.name);
      setFormUsername(user.username);
      setFormEmail(user.email);
    }
    setEditing(false);
    setError(null);
  }

  if (loading) {
    return (
      <main className="relative min-h-dvh overflow-hidden text-white">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="mt-20 text-center text-white/60">Loading profile…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">

      <div className="relative mx-auto max-w-2xl px-6 py-16">
        <header className="mt-8">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
              <p className="mt-2 text-white/70">View and edit your account information</p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/10"
            >
              Back to home
            </Link>
          </div>
        </header>

        <section className="mt-10 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          {/* Avatar placeholder */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-400 text-2xl font-bold text-white shadow-lg">
              {user?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <div className="text-lg font-semibold">{user?.name}</div>
              <div className="text-sm text-white/60">@{user?.username}</div>
            </div>
          </div>

          {success && (
            <div className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/20">
              {success}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 ring-1 ring-red-500/20">
              {error}
            </div>
          )}

          {!editing ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-black/20 p-4 ring-1 ring-white/10">
                <div className="text-xs font-semibold text-white/50">Full Name</div>
                <div className="mt-1 text-sm text-white">{user?.name}</div>
              </div>
              <div className="rounded-xl bg-black/20 p-4 ring-1 ring-white/10">
                <div className="text-xs font-semibold text-white/50">Username</div>
                <div className="mt-1 text-sm text-white">@{user?.username}</div>
              </div>
              <div className="rounded-xl bg-black/20 p-4 ring-1 ring-white/10">
                <div className="text-xs font-semibold text-white/50">Email</div>
                <div className="mt-1 text-sm text-white">{user?.email}</div>
              </div>
              {user?.createdAt && (
                <div className="rounded-xl bg-black/20 p-4 ring-1 ring-white/10">
                  <div className="text-xs font-semibold text-white/50">Member since</div>
                  <div className="mt-1 text-sm text-white">
                    {new Date(user.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-sky-950/40 ring-1 ring-white/10 hover:opacity-95"
              >
                Edit profile
              </button>
            </div>
          ) : (
            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/50">Full Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-sky-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50">Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-sky-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-sky-500/50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-sky-950/40 ring-1 ring-white/10 hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center justify-center rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
