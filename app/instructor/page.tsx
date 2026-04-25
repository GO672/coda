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

type MainRoomDraft = {
  name: string;
  description: string;
  language: string;
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

const DEFAULT_CODE: Record<string, string> = {
  javascript: 'function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));\n',
  typescript: 'function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));\n',
  python: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
  csharp: 'Console.WriteLine("Hello, World!");\n',
  ruby: 'def greet(name)\n  "Hello, #{name}!"\nend\n\nputs greet("World")\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n',
  rust: 'fn main() {\n    println!("Hello, World!");\n}\n',
  php: '<?php\nfunction greet($name) {\n    return "Hello, $name!";\n}\n\necho greet("World") . "\\n";\n',
};

type RoomStats = {
  totalStudents: number;
  handsRaised: number;
  submitted: number;
};

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export default function InstructorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = React.useState(false);
  const [draft, setDraft] = React.useState<MainRoomDraft>({ name: "", description: "", language: "javascript" });
  const [errors, setErrors] = React.useState<{ name?: string; description?: string }>({});
  const [room, setRoom] = React.useState<MainRoomDraft | null>(null);
  const [inviteCode, setInviteCode] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<"code" | "link" | null>(null);
  const [totalStudents, setTotalStudents] = React.useState(0);
  const [handsRaised, setHandsRaised] = React.useState(0);
  const [submitted, setSubmitted] = React.useState(0);
  const [loadingRoom, setLoadingRoom] = React.useState(false);
  const [roomLanguage, setRoomLanguage] = React.useState("javascript");
  const [codeDraft, setCodeDraft] = React.useState(
    DEFAULT_CODE["javascript"] || "",
  );
  const [output, setOutput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeUsers, setActiveUsers] = React.useState<{ id: string; name: string; role: string }[]>([]);
  const [userName, setUserName] = React.useState<string | null>(null);
  const [privateRooms, setPrivateRooms] = React.useState<{ code: string; studentName: string; createdAt: number; studentActive?: boolean; lastLeftAt?: number | null; handRaised?: boolean; submitted?: boolean }[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<{ id: string; name: string } | null>(null);
  const { socket } = useSocket(userName ? inviteCode : null, userName ?? "Instructor", "instructor");
  const { micOn, inCall, localLevel, peerStates, toggleMic } = useGroupVoiceChat(socket, inviteCode ?? "");

  // Fetch actual username before connecting to socket, and re-fetch on tab focus
  React.useEffect(() => {
    function fetchName() {
      fetch("/api/auth/profile", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setUserName(d?.user?.username || d?.user?.name || "Instructor"))
        .catch(() => setUserName("Instructor"));
    }
    fetchName();
    function onVisibility() {
      if (document.visibilityState === "visible") fetchName();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const code = (searchParams.get("code") || "").trim().toUpperCase();
    if (!code) {
      setShowModal(true);
      return;
    }

    setLoadingRoom(true);
    fetch(`/api/rooms/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("failed");
        const data = await r.json();
        const rRoom = data?.room;
        const lang = rRoom?.language || "javascript";
        setInviteCode(rRoom?.code || code);
        setRoomLanguage(lang);
        setRoom({ name: String(rRoom?.name || ""), description: String(rRoom?.description || ""), language: lang });
        if (rRoom?.codeContent) {
          setCodeDraft(rRoom.codeContent);
        } else {
          // No code in DB yet — persist the default placeholder so students get it
          const defaultCode = DEFAULT_CODE[lang] || DEFAULT_CODE["javascript"] || "";
          setCodeDraft(defaultCode);
          fetch(`/api/rooms/${encodeURIComponent(rRoom?.code || code)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codeContent: defaultCode }),
          }).catch(() => {});
        }
        const s: RoomStats = rRoom?.stats || { totalStudents: 0, handsRaised: 0, submitted: 0 };
        setTotalStudents(Number(s.totalStudents) || 0);
        setHandsRaised(Number(s.handsRaised) || 0);
        setSubmitted(Number(s.submitted) || 0);
        setShowModal(false);
      })
      .catch(() => {
        setShowModal(true);
      })
      .finally(() => setLoadingRoom(false));
  }, [searchParams]);

  // Keep a ref to the latest codeDraft so the socket effect can read it
  const codeDraftRef = React.useRef(codeDraft);
  codeDraftRef.current = codeDraft;

  // Socket.IO: when connected, push current code so server has it in memory
  React.useEffect(() => {
    if (!socket || !inviteCode) return;

    function onCodeSync({ code }: { code: string }) {
      if (code) setCodeDraft(code);
    }

    socket.on("code-sync", onCodeSync);

    function onStatsUpdate(stats: { totalStudents?: number }) {
      if (stats.totalStudents != null) setTotalStudents(stats.totalStudents);
    }
    socket.on("stats-update", onStatsUpdate);

    function onRoomUsers(users: { id: string; name: string; role: string }[]) {
      setActiveUsers(users);
    }
    socket.on("room-users", onRoomUsers);

    function onPrivateRoomsList(list: { code: string; studentName: string; createdAt: number; studentActive?: boolean; lastLeftAt?: number | null; handRaised?: boolean; submitted?: boolean }[]) {
      setPrivateRooms(list);
    }
    socket.on("private-rooms-list", onPrivateRoomsList);

    function onPrivateRoomError({ message }: { message: string }) {
      alert(message);
    }
    socket.on("private-room-error", onPrivateRoomError);

    // Request existing private rooms list
    socket.emit("get-private-rooms", { mainRoom: inviteCode });

    // Push the instructor's current code to the server immediately
    // so any student joining later gets it via code-sync
    const current = codeDraftRef.current;
    if (current) {
      socket.emit("code-change", { roomCode: inviteCode, code: current });
    }

    return () => {
      socket.off("code-sync", onCodeSync);
      socket.off("stats-update", onStatsUpdate);
      socket.off("room-users", onRoomUsers);
      socket.off("private-rooms-list", onPrivateRoomsList);
      socket.off("private-room-error", onPrivateRoomError);
    };
  }, [socket, inviteCode]);

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function saveCode(newCode: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const currentCode = (inviteCode || "").trim().toUpperCase();
      if (!currentCode) return;
      fetch(`/api/rooms/${encodeURIComponent(currentCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeContent: newCode }),
      }).catch(() => {});
    }, 500);
  }

  function handleCodeChange(newCode: string) {
    setCodeDraft(newCode);
    saveCode(newCode);
    if (socket && inviteCode) {
      socket.emit("code-change", { roomCode: inviteCode, code: newCode });
    }
  }

  function handleCursorChange(sel: { selStart: number; selEnd: number }) {
    if (!socket || !inviteCode) return;
    socket.emit("cursor-move", {
      roomCode: inviteCode,
      cursor: sel,
    });
  }

  function validate(nextDraft: MainRoomDraft) {
    const nextErrors: { name?: string; description?: string } = {};
    if (!nextDraft.name.trim()) nextErrors.name = "Room name is required";
    if (!nextDraft.description.trim()) nextErrors.description = "Task description is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function createRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextDraft = { name: draft.name, description: draft.description, language: draft.language };
    if (!validate(nextDraft)) return;

    setLoadingRoom(true);
    try {
      const existingCode = (inviteCode || "").trim().toUpperCase();
      const isEdit = Boolean(existingCode);

      const res = await fetch(isEdit ? `/api/rooms/${encodeURIComponent(existingCode)}` : "/api/rooms", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextDraft.name, description: nextDraft.description, language: nextDraft.language }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ name: data?.error || "Failed to create room" });
        return;
      }

      const created = data?.room;
      const roomCode = created?.code ?? existingCode ?? generateInviteCode();
      setInviteCode(roomCode);
      const createdLang = created?.language || draft.language || "javascript";
      const prevLang = roomLanguage;
      setRoomLanguage(createdLang);
      setRoom({ name: String(created?.name || ""), description: String(created?.description || ""), language: createdLang });
      // Only set stats from DB on initial creation; during edits keep the live socket values
      if (!isEdit) {
        const s: RoomStats = created?.stats || { totalStudents: 0, handsRaised: 0, submitted: 0 };
        setTotalStudents(Number(s.totalStudents) || 0);
        setHandsRaised(Number(s.handsRaised) || 0);
        setSubmitted(Number(s.submitted) || 0);
      }

      // If language changed, reset code to the new language's default
      if (createdLang !== prevLang) {
        const newDefault = DEFAULT_CODE[createdLang] || "";
        setCodeDraft(newDefault);
        setOutput("");
        // Persist to DB
        fetch(`/api/rooms/${encodeURIComponent(roomCode)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codeContent: newDefault }),
        }).catch(() => {});
        // Push to students via socket
        if (socket) {
          socket.emit("code-change", { roomCode, code: newDefault });
        }
      }

      if (created?.code && !isEdit) {
        router.replace(`/instructor?code=${encodeURIComponent(created.code)}`);
      }
      setShowModal(false);
    } finally {
      setLoadingRoom(false);
    }
  }

  const inviteLink = React.useMemo(() => {
    if (!inviteCode) return "";
    if (typeof window === "undefined") return "";
    const url = new URL("/join", window.location.origin);
    url.searchParams.set("code", inviteCode);
    return url.toString();
  }, [inviteCode]);

  // ── Streaming execution via Socket.IO ──
  React.useEffect(() => {
    if (!socket) return;

    function onStdout({ data }: { data: string }) {
      setOutput((prev) => prev + data);
    }
    function onStderr({ data }: { data: string }) {
      setOutput((prev) => prev + data);
    }
    function onExit({ code: exitCode }: { code: number }) {
      setIsRunning(false);
      setOutput((prev) => prev + `\n[Process exited with code ${exitCode}]`);
    }

    socket.on("execute-stdout", onStdout);
    socket.on("execute-stderr", onStderr);
    socket.on("execute-exit", onExit);

    return () => {
      socket.off("execute-stdout", onStdout);
      socket.off("execute-stderr", onStderr);
      socket.off("execute-exit", onExit);
    };
  }, [socket]);

  function handleTerminalInput(value: string) {
    if (!socket) return;
    socket.emit("execute-stdin", { data: value });
  }

  function handleKill() {
    if (!socket) return;
    socket.emit("execute-kill");
    setIsRunning(false);
    setOutput((prev) => prev + "\n[Process killed]");
  }

  function runCode() {
    if (!socket || !inviteCode) return;
    setIsRunning(true);
    setOutput("");
    socket.emit("execute-code", {
      roomCode: inviteCode,
      code: codeDraft,
      language: roomLanguage,
    });
  }

  async function copy(kind: "code" | "link") {
    try {
      const text = kind === "code" ? inviteCode ?? "" : inviteLink;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      setCopied(null);
    }
  }

  function createPrivateRoom(studentId: string, studentName: string) {
    if (!socket || !inviteCode) return;
    socket.emit("create-private-room", { mainRoom: inviteCode, studentSocketId: studentId, studentName });
    setSelectedStudent(null);
  }

  function timeSince(ts: number) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  const userColors = ["from-sky-400 to-blue-500", "from-emerald-400 to-teal-500", "from-amber-400 to-orange-500", "from-rose-400 to-pink-500", "from-violet-400 to-purple-500", "from-cyan-400 to-sky-500", "from-lime-400 to-green-500", "from-red-400 to-rose-500"];
  function avatarColor(idx: number) {
    return userColors[idx % userColors.length];
  }

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">

      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-col gap-8">
          <header className="mt-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight">Instructor</h1>
                  {room && (
                    <span className="rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                      Live
                    </span>
                  )}
                </div>
                <p className="mt-2 text-white/60">
                  Create your Main Room, present the task, then jump into private rooms for 1:1 help.
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(room ?? { name: "", description: "", language: "javascript" });
                    setErrors({});
                    setShowModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-950/30 hover:opacity-90 transition-opacity"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={room ? "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" : "M12 4.5v15m7.5-7.5h-15"} /></svg>
                  {room ? "Edit Main Room" : "Create Main Room"}
                </button>
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

          {/* Navigation tabs */}
          {privateRooms.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
              <div className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500/20 to-violet-500/20 px-4 py-2 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/20">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" /></svg>
                Main Room
              </div>
              {privateRooms.map((pr) => (
                <a
                  key={pr.code}
                  href={`/private-room?code=${encodeURIComponent(pr.code)}&role=instructor&mainRoom=${encodeURIComponent(inviteCode || "")}`}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors"
                >
                  <svg className="h-3.5 w-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                  {pr.studentName}
                </a>
              ))}
            </div>
          )}

          <section className="grid gap-6">
            <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-6 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-fuchsia-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" /></svg>
                  <h2 className="text-lg font-semibold">Main Room</h2>
                </div>
                <div className="flex items-center gap-2">
                  {inviteCode && (
                    <a
                      href={`/analytics?room=${encodeURIComponent(inviteCode)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 px-3 py-1 text-xs font-semibold text-violet-300 ring-1 ring-violet-400/30 hover:from-violet-500/30 hover:to-fuchsia-500/30 transition-all"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
                      Analytics
                    </a>
                  )}
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${room ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 ring-emerald-400/30" : "bg-white/5 text-white/50 ring-white/10"}`}>
                    {room ? "Ready" : "Not created"}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400/70">Session</div>
                    <div className="mt-1 text-sm text-white">
                      <span className="font-semibold">{room?.name ?? "—"}</span>
                      <span className="text-white/40"> · </span>
                      <span className={room ? "text-emerald-300" : "text-white/50"}>{room ? "Active" : loadingRoom ? "Loading" : "Inactive"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-gradient-to-br from-sky-500/10 to-sky-600/5 p-4 ring-1 ring-sky-400/20">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
                      <div className="text-xs font-semibold text-sky-300/80">Total students</div>
                    </div>
                    <div className="mt-2 text-3xl font-bold tracking-tight text-white">{room ? totalStudents : "—"}</div>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-600/5 p-4 ring-1 ring-amber-400/20">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 0-.668-.668 1.667 1.667 0 0 1-1.667-1.667V8.25a1.575 1.575 0 0 0-1.575-1.575 1.575 1.575 0 0 1-1.575-1.575V4.575" /></svg>
                      <div className="text-xs font-semibold text-amber-300/80">Hands raised</div>
                    </div>
                    <div className="mt-2 text-3xl font-bold tracking-tight text-white">{room ? privateRooms.filter((pr) => pr.handRaised).length : "—"}</div>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-600/5 p-4 ring-1 ring-emerald-400/20">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      <div className="text-xs font-semibold text-emerald-300/80">Submitted</div>
                    </div>
                    <div className="mt-2 text-3xl font-bold tracking-tight text-white">{room ? privateRooms.filter((pr) => pr.submitted).length : "—"}</div>
                  </div>
                </div>
              </div>

              {/* Voice Channel */}
              <div className="mt-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 p-3 ring-1 ring-violet-400/20">
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

              <div className="mt-6 space-y-4">
                <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400/70">Invitation code</div>
                      <div className="mt-1 font-mono text-lg tracking-widest text-sky-300">{inviteCode ?? "—"}</div>
                    </div>
                    <button
                      type="button"
                      disabled={!inviteCode}
                      onClick={() => copy("code")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                      {copied === "code" ? "Copied!" : "Copy code"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-violet-400/70">Invite link</div>
                      <div className="mt-1 truncate font-mono text-sm text-white/70">{inviteLink || "—"}</div>
                    </div>
                    <button
                      type="button"
                      disabled={!inviteLink}
                      onClick={() => copy("link")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                      {copied === "link" ? "Copied!" : "Copy link"}
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-white/40">
                    Share the link with students. They can paste it in the browser to join your main room.
                  </p>
                </div>

              </div>
            </div>
          </section>

          {room ? (
            <section className="grid items-start gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
                      <h2 className="text-lg font-semibold">Code Editor</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-gradient-to-r from-sky-500/20 to-violet-500/20 px-3 py-1 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/20">
                        {SUPPORTED_LANGUAGES.find((l) => l.value === roomLanguage)?.label || roomLanguage}
                      </div>
                      <button
                        type="button"
                        onClick={runCode}
                        disabled={isRunning}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:from-emerald-500/30 hover:to-teal-500/30 disabled:opacity-50 transition-all"
                      >
                        {isRunning ? (
                          <>
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                            Running…
                          </>
                        ) : (
                          <>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            Run
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                    <CodeEditor
                      value={codeDraft}
                      onChange={handleCodeChange}
                      language={roomLanguage}
                      height="350px"
                      onCursorChange={handleCursorChange}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Live collaborative editor · Changes sync in real-time
                  </div>
                </div>

                <Terminal
                  output={output}
                  isRunning={isRunning}
                  onInput={handleTerminalInput}
                  onKill={handleKill}
                  onClear={() => setOutput("")}
                />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-6 ring-1 ring-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                    <h2 className="text-lg font-semibold">Exercise</h2>
                  </div>
                  <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70">Task</div>
                    <div className="mt-1.5 text-base font-semibold text-white">{room.name}</div>
                    <div className="mt-3 text-sm leading-relaxed text-white/70 whitespace-pre-wrap">{room.description}</div>
                  </div>
                </div>

                {/* Members */}
                {activeUsers.length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
                      <h3 className="text-sm font-semibold text-white/80">Members</h3>
                      <span className="ml-auto rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">{activeUsers.length}</span>
                    </div>
                    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1">
                      {activeUsers.map((u, idx) => (
                        <div
                          key={u.id}
                          className={`flex flex-col items-center gap-1.5 min-w-[60px] ${u.role === "student" ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                          onClick={() => { if (u.role === "student") setSelectedStudent({ id: u.id, name: u.name }); }}
                        >
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

                {/* Private Rooms */}
                {privateRooms.length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                      <h3 className="text-sm font-semibold text-white/80">Private Rooms</h3>
                      <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">{privateRooms.length}</span>
                    </div>
                    <div className="space-y-2">
                      {privateRooms.map((pr) => (
                        <div key={pr.code} className="flex items-center justify-between rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-white">
                              Session with {pr.studentName}
                              {pr.handRaised && (
                                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">✋ Hand</span>
                              )}
                              {pr.submitted && (
                                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">✓ Submitted</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                              <span className={`inline-block h-2 w-2 rounded-full ${pr.studentActive ? "bg-emerald-400" : "bg-zinc-500"}`} />
                              {pr.studentActive ? "Active" : `Inactive${pr.lastLeftAt ? " · " + timeSince(pr.lastLeftAt) : ""}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (!socket) return;
                                if (confirm(`End session with ${pr.studentName}? They will be sent back to the main room.`)) {
                                  socket.emit("end-private-session", { privateRoomCode: pr.code });
                                }
                              }}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-red-500/20 to-rose-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-red-400/20 hover:from-red-500/30 hover:to-rose-500/30 transition-all"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" /></svg>
                              End
                            </button>
                            <a
                              href={`/private-room?code=${encodeURIComponent(pr.code)}&role=instructor&mainRoom=${encodeURIComponent(inviteCode || "")}`}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
                            >
                              Join
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raised Hands */}
                {privateRooms.filter((pr) => pr.handRaised).length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-lg">✋</span>
                      <h3 className="text-sm font-semibold text-white/80">Raised Hands</h3>
                      <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">{privateRooms.filter((pr) => pr.handRaised).length}</span>
                    </div>
                    <div className="space-y-2">
                      {privateRooms.filter((pr) => pr.handRaised).map((pr) => (
                        <div key={pr.code} className="flex items-center justify-between rounded-xl bg-black/30 p-3 ring-1 ring-amber-400/20">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${pr.studentActive ? "bg-emerald-400" : "bg-zinc-500"}`} />
                            <span className="text-sm font-semibold text-white">{pr.studentName}</span>
                          </div>
                          <a
                            href={`/private-room?code=${encodeURIComponent(pr.code)}&role=instructor&mainRoom=${encodeURIComponent(inviteCode || "")}`}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500/30 to-orange-500/30 px-3 py-1.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/20 hover:opacity-90 transition-opacity"
                          >
                            Go to Room
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submitted Tasks */}
                {privateRooms.filter((pr) => pr.submitted).length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      <h3 className="text-sm font-semibold text-white/80">Submitted Tasks</h3>
                      <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">{privateRooms.filter((pr) => pr.submitted).length}</span>
                    </div>
                    <div className="space-y-2">
                      {privateRooms.filter((pr) => pr.submitted).map((pr) => (
                        <div key={pr.code} className="flex items-center justify-between rounded-xl bg-black/30 p-3 ring-1 ring-emerald-400/20">
                          <div className="flex items-center gap-2">
                            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                            <span className="text-sm font-semibold text-white">{pr.studentName}</span>
                          </div>
                          <a
                            href={`/private-room?code=${encodeURIComponent(pr.code)}&role=instructor&mainRoom=${encodeURIComponent(inviteCode || "")}`}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500/30 to-teal-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/20 hover:opacity-90 transition-opacity"
                          >
                            Review
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowModal(false)} />
          <div className="absolute inset-0 flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-xl rounded-2xl bg-zinc-950 p-6 ring-1 ring-white/10 shadow-2xl shadow-black/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">Create Main Room</h3>
                  <p className="mt-1 text-sm text-white/60">
                    Set the room title and the task you want students to work on.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={createRoom}>
                <div>
                  <label className="block text-sm font-semibold text-white">Room name</label>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Arrays & Two Pointers"
                    className="mt-2 w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                  />
                  {errors.name ? <p className="mt-2 text-sm text-red-300">{errors.name}</p> : null}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white">Task description</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Describe the task, constraints, and what students should submit..."
                    rows={6}
                    className="mt-2 w-full resize-none rounded-xl bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40"
                  />
                  {errors.description ? <p className="mt-2 text-sm text-red-300">{errors.description}</p> : null}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white">Programming Language</label>
                  <select
                    value={draft.language}
                    onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value} className="bg-zinc-900 text-white">
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ name: "", description: "", language: "javascript" });
                      setErrors({});
                    }}
                    className="inline-flex items-center justify-center rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-fuchsia-950/40 ring-1 ring-white/10 hover:opacity-95"
                  >
                    Create room
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirm private room creation */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSelectedStudent(null)} />
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-950 p-6 ring-1 ring-white/10 shadow-2xl shadow-black/60">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${avatarColor(Math.max(0, activeUsers.findIndex((u) => u.id === selectedStudent.id)))} text-lg font-bold text-white shadow-lg`}>
                  {selectedStudent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-base font-semibold text-white">{selectedStudent.name}</div>
                  <div className="text-xs text-white/50">Student</div>
                </div>
              </div>
              <p className="text-sm text-white/70">
                Create a private 1:1 room with <span className="font-semibold text-white">{selectedStudent.name}</span>? They will be automatically redirected to the private session.
              </p>
              <div className="mt-6 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createPrivateRoom(selectedStudent.id, selectedStudent.name)}
                  className="rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
                >
                  Create Private Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Room Chat */}
      {socket && inviteCode && userName && (
        <RoomChat socket={socket} roomCode={inviteCode} userName={userName} />
      )}
    </main>
  );
}
