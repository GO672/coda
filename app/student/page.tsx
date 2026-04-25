"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSocket } from "@/lib/useSocket";
import { useGroupVoiceChat } from "@/lib/useGroupVoiceChat";
import dynamic from "next/dynamic";
const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });
const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });
const RoomChat = dynamic(() => import("@/components/RoomChat").then((m) => ({ default: m.RoomChat })), { ssr: false });

type RoomStats = {
  totalStudents: number;
  handsRaised: number;
  submitted: number;
};

type Room = {
  code: string;
  name: string;
  description: string;
  language?: string;
  codeContent?: string;
  stats?: RoomStats;
};

const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "ruby", label: "Ruby" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
];

export default function StudentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = React.useState<string | null>(null);
  const [room, setRoom] = React.useState<Room | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [codeDraft, setCodeDraft] = React.useState("");
  const [userName, setUserName] = React.useState<string | null>(null);
  const { socket } = useSocket(userName ? code : null, userName ?? "Student", "student");
  const { micOn, inCall, localLevel, peerStates, toggleMic } = useGroupVoiceChat(socket, code ?? "");
  const [output, setOutput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const execStartedRef = React.useRef(false);
  const [instructorCursor, setInstructorCursor] = React.useState<{ selStart: number; selEnd: number; name?: string } | null>(null);
  const [activeUsers, setActiveUsers] = React.useState<{ id: string; name: string; role: string }[]>([]);
  const [myPrivateRoom, setMyPrivateRoom] = React.useState<{ privateRoomCode: string; instructorName: string; mainRoom: string } | null>(null);
  const codeRef = React.useRef(code);
  codeRef.current = code;

  // Fetch actual username before connecting to socket, and re-fetch on tab focus
  React.useEffect(() => {
    function fetchName() {
      fetch("/api/auth/profile", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setUserName(d?.user?.username || d?.user?.name || "Student"))
        .catch(() => setUserName("Student"));
    }
    fetchName();
    function onVisibility() {
      if (document.visibilityState === "visible") fetchName();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  async function loadRoom(normalized: string, opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const r = await fetch(`/api/rooms/${encodeURIComponent(normalized)}`, { cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRoom(null);
        setError(data?.error || "Failed to load room");
        return;
      }
      const fetched = data?.room ?? null;
      setRoom(fetched);
      if (fetched?.codeContent != null) setCodeDraft(fetched.codeContent);
    } catch {
      setRoom(null);
      setError("Failed to load room");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  React.useEffect(() => {
    const c = searchParams.get("code");
    const normalized = c ? c.toUpperCase() : null;
    setCode(normalized);

    if (!normalized) {
      setRoom(null);
      setError("Missing classroom code");
      return;
    }

    loadRoom(normalized);

    // Still poll for room metadata (name, description, stats) every 10s
    const id = window.setInterval(() => {
      loadRoom(normalized, { silent: true });
    }, 10000);

    return () => window.clearInterval(id);
  }, [searchParams]);

  // Socket.IO: listen for real-time code updates + output
  React.useEffect(() => {
    if (!socket) return;

    function onCodeUpdate({ code: newCode }: { code: string }) {
      setCodeDraft(newCode);
    }
    function onCodeSync({ code: newCode }: { code: string }) {
      if (newCode) setCodeDraft(newCode);
    }

    function onOutputUpdate({ output: newOutput }: { output: string }) {
      setOutput(newOutput || "");
    }

    // Streaming execution events from instructor
    function onExecStdout({ data }: { data: string }) {
      if (!execStartedRef.current) {
        execStartedRef.current = true;
        setOutput(data);
      } else {
        setOutput((prev) => prev + data);
      }
      setIsRunning(true);
    }
    function onExecStderr({ data }: { data: string }) {
      if (!execStartedRef.current) {
        execStartedRef.current = true;
        setOutput(data);
      } else {
        setOutput((prev) => prev + data);
      }
      setIsRunning(true);
    }
    function onExecExit({ code: exitCode }: { code: number }) {
      setIsRunning(false);
      execStartedRef.current = false;
      setOutput((prev) => prev + `\n[Process exited with code ${exitCode}]`);
    }

    function onCursorUpdate(data: { selStart: number; selEnd: number; name?: string; role?: string }) {
      if (data.role === "instructor" || !data.role) {
        setInstructorCursor({ selStart: data.selStart, selEnd: data.selEnd, name: data.name || "Instructor" });
      }
    }
    function onCursorRemove() {
      setInstructorCursor(null);
    }

    function onStatsUpdate(stats: { totalStudents?: number }) {
      if (stats.totalStudents != null) {
        setRoom((prev) =>
          prev
            ? { ...prev, stats: { ...(prev.stats || { totalStudents: 0, handsRaised: 0, submitted: 0 }), totalStudents: stats.totalStudents! } }
            : prev,
        );
      }
    }

    socket.on("code-update", onCodeUpdate);
    socket.on("code-sync", onCodeSync);
    socket.on("output-update", onOutputUpdate);
    socket.on("execute-stdout", onExecStdout);
    socket.on("execute-stderr", onExecStderr);
    socket.on("execute-exit", onExecExit);
    function onRoomUsers(users: { id: string; name: string; role: string }[]) {
      setActiveUsers(users);
    }

    function onPrivateRoomInvite({ privateRoomCode, mainRoom, instructorName }: { privateRoomCode: string; instructorName: string; mainRoom?: string }) {
      const mr = mainRoom || codeRef.current || "";
      setMyPrivateRoom({ privateRoomCode, instructorName: instructorName || "Instructor", mainRoom: mr });
      router.push(`/private-room?code=${encodeURIComponent(privateRoomCode)}&role=student&mainRoom=${encodeURIComponent(mr)}`);
    }

    function onYourPrivateRoom({ privateRoomCode, instructorName, mainRoom }: { privateRoomCode: string; instructorName: string; mainRoom: string }) {
      setMyPrivateRoom({ privateRoomCode, instructorName, mainRoom });
    }

    socket.on("cursor-update", onCursorUpdate);
    socket.on("cursor-remove", onCursorRemove);
    socket.on("stats-update", onStatsUpdate);
    socket.on("room-users", onRoomUsers);
    socket.on("private-room-invite", onPrivateRoomInvite);
    socket.on("your-private-room", onYourPrivateRoom);

    return () => {
      socket.off("code-update", onCodeUpdate);
      socket.off("code-sync", onCodeSync);
      socket.off("output-update", onOutputUpdate);
      socket.off("execute-stdout", onExecStdout);
      socket.off("execute-stderr", onExecStderr);
      socket.off("execute-exit", onExecExit);
      socket.off("cursor-update", onCursorUpdate);
      socket.off("cursor-remove", onCursorRemove);
      socket.off("stats-update", onStatsUpdate);
      socket.off("room-users", onRoomUsers);
      socket.off("private-room-invite", onPrivateRoomInvite);
      socket.off("your-private-room", onYourPrivateRoom);
    };
  }, [socket]);

  const userColors = ["from-sky-400 to-blue-500", "from-emerald-400 to-teal-500", "from-amber-400 to-orange-500", "from-rose-400 to-pink-500", "from-violet-400 to-purple-500", "from-cyan-400 to-sky-500", "from-lime-400 to-green-500", "from-red-400 to-rose-500"];
  function avatarColor(idx: number) {
    return userColors[idx % userColors.length];
  }

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">

      <div className="mx-auto max-w-6xl px-6 py-16">
        <header className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{room?.name ? `Main Room` : "Main Room"}</h1>
                {room && (
                  <span className="rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                    Live
                  </span>
                )}
              </div>
              <p className="mt-2 text-white/60">
                Classroom code: <span className="font-mono tracking-widest text-sky-300">{code ?? "—"}</span>
                {room?.name && <span className="text-white/40"> · </span>}
                {room?.name && <span className="text-white/70">{room.name}</span>}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
                Back to home
              </Link>
            </div>
          </div>
        </header>

        {/* Private Room Banner */}
        {myPrivateRoom && (
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-gradient-to-r from-rose-500/10 to-pink-500/10 p-4 ring-1 ring-rose-400/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/20 to-pink-500/20 ring-1 ring-rose-400/30">
                <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Private Room Active</div>
                <div className="text-xs text-white/50">1:1 session with {myPrivateRoom.instructorName}</div>
              </div>
            </div>
            <a
              href={`/private-room?code=${encodeURIComponent(myPrivateRoom.privateRoomCode)}&role=student&mainRoom=${encodeURIComponent(myPrivateRoom.mainRoom)}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-950/30 hover:opacity-90 transition-opacity"
            >
              Go to Private Room
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
            </a>
          </div>
        )}

        {loading ? (
          <div className="mt-10 flex items-center gap-3 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 text-white/70">
            <svg className="h-5 w-5 animate-spin text-sky-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Loading room…
          </div>
        ) : error ? (
          <div className="mt-10 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
              {error}
            </div>
            <p className="mt-2 text-sm text-white/60">
              Ask your instructor for a valid invite link, or go back and join again.
            </p>
            <div className="mt-6">
              <Link
                href="/join"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-950/40 ring-1 ring-white/10 hover:opacity-95 transition-opacity"
              >
                Enter invite code
              </Link>
            </div>
          </div>
        ) : (<>
          {/* Voice Channel */}
          <div className="mt-10 rounded-xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 p-3 ring-1 ring-violet-400/20">
            <div className="flex items-center gap-2 mb-2.5">
              <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
              <span className="text-xs font-semibold text-violet-300">Voice Channel</span>
              {!inCall && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                  Connecting…
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-stretch gap-2">
              {activeUsers.map((u) => {
                const isMe = u.name === userName;
                const peerData = !isMe ? Object.entries(peerStates).find(([pid]) => activeUsers.find((au) => au.id === pid && au.name === u.name)) : null;
                const isSpeaking = isMe ? (micOn && localLevel > 0.01) : (peerData ? peerData[1].level > 0.01 : false);
                const isMuted = isMe ? !micOn : (peerData ? peerData[1].muted : false);
                const isInstructor = u.role === "instructor";
                const ringColor = isInstructor ? "ring-amber-400" : "ring-sky-400";
                const bgColor = isInstructor ? "bg-amber-500/25" : "bg-sky-500/25";
                const textColor = isInstructor ? "text-amber-300" : "text-sky-300";
                const dimRing = isInstructor ? "ring-amber-400/20" : "ring-sky-400/20";
                return (
                  <div key={u.id} className="flex flex-1 min-w-[140px] items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 ${isSpeaking ? `${bgColor} ring-2 ${ringColor} shadow-[0_0_10px_rgba(52,211,153,0.3)]` : `bg-white/5 ring-1 ${dimRing}`}`}>
                      {isMuted ? (
                        <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m18.364 18.364-3.536-3.536m0 0a3 3 0 1 0-4.243-4.243L7.05 7.05m3.536 3.536L7.05 7.05m0 0L3.515 3.515m3.535 3.535L3.515 3.515m14.849 14.849L21.9 21.9m-3.536-3.536 3.536 3.536M12 18.75a6 6 0 0 0 4.243-1.757" /></svg>
                      ) : (
                        <svg className={`h-3.5 w-3.5 transition-colors duration-150 ${isSpeaking ? textColor : "text-white/30"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className={`text-xs font-semibold leading-tight truncate ${isSpeaking ? "text-white" : "text-white/70"}`}>
                        {u.name}{isMe && " (You)"}
                      </span>
                      <div className={`h-1 w-3 rounded-full mt-0.5 ${isInstructor ? "bg-amber-400/60" : "bg-sky-400/60"}`} />
                    </div>
                    {isMe && inCall ? (
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`ml-auto shrink-0 rounded-lg px-3 py-1 text-[10px] font-semibold transition-colors ring-1 ${micOn ? "bg-violet-500/20 text-violet-300 ring-violet-400/30 hover:bg-violet-500/30" : "bg-red-500/20 text-red-300 ring-red-400/30 hover:bg-red-500/30"}`}
                      >
                        {micOn ? "Mute" : "Unmute"}
                      </button>
                    ) : isMuted ? (
                      <span className="ml-auto shrink-0 rounded-lg bg-red-500/10 px-3 py-1 text-[10px] font-semibold text-red-400/70 ring-1 ring-red-400/20">Muted</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <section className="mt-6 grid items-start gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
                    <h2 className="text-lg font-semibold">Code Editor</h2>
                  </div>
                  <div className="rounded-full bg-gradient-to-r from-sky-500/20 to-violet-500/20 px-3 py-1 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/20">
                    {SUPPORTED_LANGUAGES.find((l) => l.value === (room?.language || "javascript"))?.label || room?.language || "JavaScript"}
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                  <CodeEditor
                    value={codeDraft}
                    language={room?.language || "javascript"}
                    readOnly
                    height="350px"
                    externalCursor={instructorCursor}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Live view · Instructor changes appear in real-time
                </div>
              </div>

              <Terminal
                output={output}
                isRunning={isRunning}
                readOnly
                onClear={() => setOutput("")}
              />
            </div>

            <div className="space-y-4">
              {/* Exercise */}
              <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-6 ring-1 ring-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                  <h2 className="text-lg font-semibold">Exercise</h2>
                </div>
                <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70">Task</div>
                  <div className="mt-1.5 text-base font-semibold text-white">{room?.name}</div>
                  <div className="mt-3 text-sm leading-relaxed text-white/70 whitespace-pre-wrap">{room?.description}</div>
                </div>
              </div>

              {/* Active participants — horizontal list */}
              {activeUsers.length > 0 && (
                <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
                    <h3 className="text-sm font-semibold text-white/80">Members</h3>
                    <span className="ml-auto rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">{activeUsers.length}</span>
                  </div>
                  <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1">
                    {activeUsers.map((u, idx) => (
                      <div key={u.id} className="flex flex-col items-center gap-1.5 min-w-[60px]">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${avatarColor(idx)} text-sm font-bold text-white shadow-lg ${u.role === "instructor" ? "ring-2 ring-amber-400/50" : ""}`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="max-w-[72px] truncate text-[11px] text-white/70">{u.name}</span>
                        {u.role === "instructor" && (
                          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">Instructor</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </section>
          </>
        )}

        {/* Room Chat */}
        {socket && code && userName && (
          <RoomChat socket={socket} roomCode={code} userName={userName} />
        )}
      </div>
    </main>
  );
}
