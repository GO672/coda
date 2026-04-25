"use client";

import Link from "next/link";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useSocket } from "@/lib/useSocket";
import { useVoiceChat } from "@/lib/useVoiceChat";
import dynamic from "next/dynamic";
const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });
const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });
const RoomChat = dynamic(() => import("@/components/RoomChat").then((m) => ({ default: m.RoomChat })), { ssr: false });

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

export default function PrivateRoomPage() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("code") || "";
  const role = (searchParams.get("role") || "student") as "instructor" | "student";
  const mainRoom = searchParams.get("mainRoom") || "";

  const [userName, setUserName] = React.useState<string | null>(null);
  const { socket } = useSocket(userName ? roomCode : null, userName ?? (role === "instructor" ? "Instructor" : "Student"), role);

  const { micOn, inCall, peerConnected, localLevel, remoteLevel, peerMuted, toggleMic } = useVoiceChat(socket, roomCode);

  const [codeDraft, setCodeDraft] = React.useState(DEFAULT_CODE["python"] || "");
  const [language, setLanguage] = React.useState("python");
  const [output, setOutput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeUsers, setActiveUsers] = React.useState<{ id: string; name: string; role: string }[]>([]);
  const [remoteCursor, setRemoteCursor] = React.useState<{ selStart: number; selEnd: number; name?: string } | null>(null);
  const [privateRoomsList, setPrivateRoomsList] = React.useState<{ code: string; studentName: string; createdAt: number; mainRoom?: string; studentActive?: boolean }[]>([]);
  const [roomInfo, setRoomInfo] = React.useState<{ name: string; description: string } | null>(null);
  const [handRaised, setHandRaised] = React.useState(false);
  const [taskSubmitted, setTaskSubmitted] = React.useState(false);

  // Fetch room description from main room
  React.useEffect(() => {
    if (!mainRoom) return;
    fetch(`/api/rooms/${encodeURIComponent(mainRoom)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.room) setRoomInfo({ name: d.room.name, description: d.room.description });
      })
      .catch(() => {});
  }, [mainRoom]);

  // Fetch username
  React.useEffect(() => {
    fetch("/api/auth/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setUserName(d?.user?.username || d?.user?.name || (role === "instructor" ? "Instructor" : "Student")))
      .catch(() => setUserName(role === "instructor" ? "Instructor" : "Student"));
  }, [role]);

  const codeDraftRef = React.useRef(codeDraft);
  codeDraftRef.current = codeDraft;

  // Socket listeners
  React.useEffect(() => {
    if (!socket || !roomCode) return;

    function onCodeSync({ code, language: lang }: { code: string; language?: string | null }) {
      if (code) setCodeDraft(code);
      if (lang) setLanguage(lang);
    }
    function onCodeUpdate({ code }: { code: string }) {
      setCodeDraft(code);
    }
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
    function onRoomUsers(users: { id: string; name: string; role: string }[]) {
      setActiveUsers(users);
    }
    function onCursorUpdate(data: { selStart: number; selEnd: number; name?: string; role?: string }) {
      setRemoteCursor({ selStart: data.selStart, selEnd: data.selEnd, name: data.name });
    }
    function onCursorRemove() {
      setRemoteCursor(null);
    }

    function onPrivateRoomsList(list: { code: string; studentName: string; createdAt: number; mainRoom?: string; studentActive?: boolean }[]) {
      setPrivateRoomsList(list);
    }
    function onLanguageUpdate({ language: newLang }: { language: string }) {
      setLanguage(newLang);
    }
    function onHandRaiseUpdate({ handRaised: raised }: { handRaised: boolean }) {
      setHandRaised(raised);
    }
    function onSubmitTaskUpdate({ submitted: sub }: { submitted: boolean }) {
      setTaskSubmitted(sub);
    }
    function onSessionEnded({ mainRoom: mr }: { mainRoom: string }) {
      if (role === "instructor") {
        window.location.href = `/instructor?code=${encodeURIComponent(mr)}`;
      } else {
        window.location.href = `/student?code=${encodeURIComponent(mr)}`;
      }
    }

    socket.on("code-sync", onCodeSync);
    socket.on("code-update", onCodeUpdate);
    socket.on("execute-stdout", onStdout);
    socket.on("execute-stderr", onStderr);
    socket.on("execute-exit", onExit);
    socket.on("room-users", onRoomUsers);
    socket.on("cursor-update", onCursorUpdate);
    socket.on("cursor-remove", onCursorRemove);
    socket.on("private-rooms-list", onPrivateRoomsList);
    socket.on("language-update", onLanguageUpdate);
    socket.on("hand-raise-update", onHandRaiseUpdate);
    socket.on("submit-task-update", onSubmitTaskUpdate);
    socket.on("session-ended", onSessionEnded);

    // Request private rooms list for tab navigation (instructor only)
    if (role === "instructor" && mainRoom) {
      socket.emit("get-private-rooms", { mainRoom });
    }

    return () => {
      socket.off("code-sync", onCodeSync);
      socket.off("code-update", onCodeUpdate);
      socket.off("execute-stdout", onStdout);
      socket.off("execute-stderr", onStderr);
      socket.off("execute-exit", onExit);
      socket.off("room-users", onRoomUsers);
      socket.off("cursor-update", onCursorUpdate);
      socket.off("cursor-remove", onCursorRemove);
      socket.off("private-rooms-list", onPrivateRoomsList);
      socket.off("language-update", onLanguageUpdate);
      socket.off("hand-raise-update", onHandRaiseUpdate);
      socket.off("submit-task-update", onSubmitTaskUpdate);
      socket.off("session-ended", onSessionEnded);
    };
  }, [socket, roomCode, role]);

  function handleLanguageChange(newLang: string) {
    setLanguage(newLang);
    const defaultCode = DEFAULT_CODE[newLang] || "";
    setCodeDraft(defaultCode);
    if (socket && roomCode) {
      socket.emit("language-change", { roomCode, language: newLang });
      socket.emit("code-change", { roomCode, code: defaultCode });
    }
  }

  function handleCodeChange(newCode: string) {
    setCodeDraft(newCode);
    if (socket && roomCode) {
      socket.emit("code-change", { roomCode, code: newCode });
    }
  }

  function handleCursorChange(sel: { selStart: number; selEnd: number }) {
    if (!socket || !roomCode) return;
    socket.emit("cursor-move", { roomCode, cursor: sel });
  }

  function runCode() {
    if (!socket || !roomCode) return;
    setIsRunning(true);
    setOutput("");
    socket.emit("execute-code", { roomCode, code: codeDraft, language });
  }

  function raiseHand() {
    if (!socket || !roomCode) return;
    socket.emit("raise-hand", { privateRoomCode: roomCode });
  }

  function submitTask() {
    if (!socket || !roomCode) return;
    socket.emit("submit-task", { privateRoomCode: roomCode });
  }

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

  const userColors = ["from-sky-400 to-blue-500", "from-emerald-400 to-teal-500", "from-amber-400 to-orange-500", "from-rose-400 to-pink-500", "from-violet-400 to-purple-500", "from-cyan-400 to-sky-500", "from-lime-400 to-green-500", "from-red-400 to-rose-500"];
  function avatarColor(idx: number) {
    return userColors[idx % userColors.length];
  }

  const otherUser = activeUsers.find((u) => u.role !== role);

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">

      <div className="mx-auto max-w-6xl px-6 py-16">
        <header className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                <h1 className="text-3xl font-bold tracking-tight">Private Room</h1>
                <span className="rounded-full bg-gradient-to-r from-rose-500/20 to-pink-500/20 px-3 py-1 text-xs font-semibold text-rose-300 ring-1 ring-rose-400/30">
                  1:1 Session
                </span>
              </div>
              <p className="mt-2 text-white/60">
                {otherUser ? (
                  <>Session with <span className="font-semibold text-white">{otherUser.name}</span></>
                ) : (
                  <>Waiting for {role === "instructor" ? "student" : "instructor"} to join…</>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href={role === "instructor" ? `/instructor?code=${encodeURIComponent(mainRoom)}` : `/student?code=${encodeURIComponent(mainRoom)}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
                Back to Main Room
              </Link>
              {role === "instructor" && (
                <button
                  type="button"
                  onClick={() => {
                    if (!socket) return;
                    if (confirm("Accept task and end session? Both you and the student will be sent back to the main room.")) {
                      socket.emit("end-private-session", { privateRoomCode: roomCode });
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-5 py-3 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:from-emerald-500/30 hover:to-teal-500/30 transition-all"
                >
                  Accept Task
                </button>
              )}
              {role === "student" && (
                <>
                  <button
                    type="button"
                    onClick={raiseHand}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ring-1 ${handRaised ? "bg-amber-500/30 text-amber-200 ring-amber-400/40 shadow-lg shadow-amber-500/10" : "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 ring-amber-400/30 hover:from-amber-500/30 hover:to-orange-500/30"}`}
                  >
                    <span className="text-base">✋</span>
                    {handRaised ? "Lower Hand" : "Raise Hand"}
                  </button>
                  <button
                    type="button"
                    onClick={submitTask}
                    disabled={taskSubmitted}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ring-1 ${taskSubmitted ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30 cursor-default" : "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 ring-emerald-400/30 hover:from-emerald-500/30 hover:to-teal-500/30"}`}
                  >
                    {taskSubmitted ? (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        Submitted
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                        Submit Task
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Participants */}
          {activeUsers.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              {activeUsers.map((u, idx) => (
                <div key={u.id} className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${avatarColor(idx)} text-[10px] font-bold text-white ${u.role === "instructor" ? "ring-1 ring-amber-400/50" : ""}`}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-white/80">{u.name}</span>
                  <span className={`text-[9px] font-bold ${u.role === "instructor" ? "text-amber-300" : "text-sky-300"}`}>
                    {u.role === "instructor" ? "Instructor" : "Student"}
                  </span>
                </div>
              ))}
            </div>
          )}

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

            {/* Participants with mic icons — side by side */}
            <div className="flex items-stretch gap-3">
              {activeUsers.map((u) => {
                const isMe = u.name === userName;
                const isSpeaking = isMe ? (micOn && localLevel > 0.01) : (remoteLevel > 0.01);
                const isMuted = isMe ? !micOn : peerMuted;
                const isInstructor = u.role === "instructor";
                const ringColor = isInstructor ? "ring-amber-400" : "ring-sky-400";
                const bgColor = isInstructor ? "bg-amber-500/25" : "bg-sky-500/25";
                const textColor = isInstructor ? "text-amber-300" : "text-sky-300";
                const dimRing = isInstructor ? "ring-amber-400/20" : "ring-sky-400/20";
                return (
                  <div key={u.id} className="flex flex-1 min-w-0 items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
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
        </header>

        {/* Navigation tabs (instructor only) */}
        {role === "instructor" && mainRoom && privateRoomsList.length > 0 && (
          <div className="mt-6 flex items-center gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
            <a
              href={`/instructor?code=${encodeURIComponent(mainRoom)}`}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" /></svg>
              Main Room
            </a>
            {privateRoomsList.map((pr) => (
              <a
                key={pr.code}
                href={`/private-room?code=${encodeURIComponent(pr.code)}&role=instructor&mainRoom=${encodeURIComponent(mainRoom)}`}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${pr.code === roomCode ? "bg-gradient-to-r from-rose-500/20 to-pink-500/20 text-rose-300 ring-1 ring-rose-400/20" : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"}`}
              >
                <svg className="h-3.5 w-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                {pr.studentName}
                <span className={`inline-block h-2 w-2 rounded-full ${pr.studentActive ? "bg-emerald-400" : "bg-zinc-500"}`} />
              </a>
            ))}
          </div>
        )}

        <section className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4 ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
                  <h2 className="text-lg font-semibold">Code Editor</h2>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="rounded-full bg-gradient-to-r from-sky-500/20 to-violet-500/20 px-3 py-1 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/20 bg-transparent focus:outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value} className="bg-zinc-900 text-white">{l.label}</option>
                    ))}
                  </select>
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
                  language={language}
                  height="400px"
                  onCursorChange={handleCursorChange}
                  externalCursor={remoteCursor ?? undefined}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                Private 1:1 session · Real-time sync
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
            {/* Exercise / Description */}
            {roomInfo && (
              <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-6 ring-1 ring-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                  <h2 className="text-lg font-semibold">Exercise</h2>
                </div>
                <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70">Task</div>
                  <div className="mt-1.5 text-base font-semibold text-white">{roomInfo.name}</div>
                  <div className="mt-3 text-sm leading-relaxed text-white/70 whitespace-pre-wrap">{roomInfo.description}</div>
                </div>
              </div>
            )}

            {/* Session Info */}
            <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-6 ring-1 ring-white/10">
              <div className="flex items-center gap-2 mb-4">
                <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                <h2 className="text-lg font-semibold">Session Info</h2>
              </div>
              <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10 space-y-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400/70">Room Code</div>
                  <div className="mt-1 font-mono text-sm text-white/80">{roomCode}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-violet-400/70">Your Role</div>
                  <div className="mt-1 text-sm text-white/80 capitalize">{role}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400/70">Participants</div>
                  <div className="mt-1 text-sm text-white/80">{activeUsers.length} / 2</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Room Chat */}
        {socket && roomCode && userName && (
          <RoomChat socket={socket} roomCode={roomCode} userName={userName} />
        )}
      </div>
    </main>
  );
}
