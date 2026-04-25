"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

type Summary = {
  totalEvents: number;
  totalStudents: number;
  totalCodeChanges: number;
  totalExecutions: number;
  totalSubmissions: number;
  totalHandRaises: number;
  avgTimeSpent: number;
};

type TimelineEntry = {
  timestamp: number;
  code_change: number;
  execution: number;
  submission: number;
  hand_raise: number;
};

type StudentMetric = {
  name: string;
  codeChanges: number;
  executions: number;
  submissions: number;
  handRaises: number;
  maxLines: number;
  maxChars: number;
  timeSpentMinutes: number;
  languages: string[];
  lineHistory: { timestamp: number; lines: number }[];
};

type AnalyticsData = {
  summary: Summary;
  activityTimeline: TimelineEntry[];
  students: StudentMetric[];
  complexityTimeline: { timestamp: number; studentName: string; lines: number; chars: number }[];
};

const COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#e879f9", "#22d3ee", "#fb923c"];
const PIE_COLORS = ["#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#e879f9"];

function StatCard({ icon, label, value, color, delay }: { icon: React.ReactNode; label: string; value: number | string; color: string; delay: number }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10 transition-all hover:ring-white/20`}
      style={{ animation: `fade-up 0.5s ease-out ${delay * 0.08}s both` }}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-${color}-500/20 ring-1 ring-${color}-400/30`}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{value}</div>
          <div className="text-xs font-medium text-white/50">{label}</div>
        </div>
      </div>
      <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full bg-${color}-500/5 blur-2xl`} />
    </div>
  );
}

function exportCSV(data: AnalyticsData | null, roomCode: string | null) {
  if (!data || !roomCode) return;
  const rows: string[] = [];

  // Summary
  rows.push("=== Summary ===");
  rows.push(`Total Students,${data.summary.totalStudents}`);
  rows.push(`Total Code Changes,${data.summary.totalCodeChanges}`);
  rows.push(`Total Executions,${data.summary.totalExecutions}`);
  rows.push(`Total Submissions,${data.summary.totalSubmissions}`);
  rows.push(`Total Hand Raises,${data.summary.totalHandRaises}`);
  rows.push(`Avg Time Spent (min),${data.summary.avgTimeSpent}`);
  rows.push("");

  // Students
  rows.push("=== Student Metrics ===");
  rows.push("Name,Code Changes,Executions,Submissions,Hand Raises,Max Lines,Max Chars,Time Spent (min),Languages");
  for (const s of data.students) {
    rows.push(`${s.name},${s.codeChanges},${s.executions},${s.submissions},${s.handRaises},${s.maxLines},${s.maxChars},${s.timeSpentMinutes},"${s.languages.join("; ")}"`);
  }
  rows.push("");

  // Activity Timeline
  rows.push("=== Activity Timeline ===");
  rows.push("Time,Code Changes,Executions,Submissions,Hand Raises");
  for (const t of data.activityTimeline) {
    const localTime = new Date(t.timestamp).toLocaleString();
    rows.push(`${localTime},${t.code_change},${t.execution},${t.submission},${t.hand_raise}`);
  }

  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${roomCode}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF() {
  const el = document.getElementById("analytics-dashboard");
  if (!el) return;

  // Open a new window with the dashboard content and trigger print (Save as PDF)
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow pop-ups to export PDF.");
    return;
  }

  // Collect all stylesheets from current page
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((s) => s.outerHTML)
    .join("\n");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Analytics Report - ${new Date().toLocaleDateString()}</title>
      ${styles}
      <style>
        body { background: #0a0a0a !important; margin: 0; padding: 20px; }
        @media print {
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      </style>
    </head>
    <body>${el.outerHTML}</body>
    </html>
  `);
  printWindow.document.close();

  // Wait for styles/fonts to load, then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-zinc-900/95 px-3 py-2 ring-1 ring-white/10 shadow-xl text-xs">
      <div className="font-semibold text-white/70 mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-white/60">{p.name}:</span>
          <span className="font-bold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("room");
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = React.useState<string | null>(null);
  const [clearing, setClearing] = React.useState(false);

  const fetchData = React.useCallback(() => {
    if (!roomCode) return;
    setLoading(true);
    fetch(`/api/analytics?room=${encodeURIComponent(roomCode)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [roomCode]);

  const clearData = async () => {
    if (!roomCode || !confirm("Clear all analytics data for this room?")) return;
    setClearing(true);
    try {
      await fetch(`/api/analytics/clear?room=${encodeURIComponent(roomCode)}`, { method: "DELETE" });
      fetchData();
    } catch {}
    setClearing(false);
  };

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 20s
  React.useEffect(() => {
    if (!roomCode) return;
    const iv = setInterval(() => {
      fetch(`/api/analytics?room=${encodeURIComponent(roomCode)}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setData(d); });
    }, 20000);
    return () => clearInterval(iv);
  }, [roomCode]);

  if (!roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/50 text-lg">No room code provided. Add <code className="text-sky-400">?room=YOUR_CODE</code> to the URL.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          <span className="text-white/60">Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, activityTimeline, students } = data;

  // Format timeline with local time
  const timelineData = activityTimeline.map((t) => ({
    ...t,
    time: new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  // Pie chart data for student activity distribution
  const pieData = [
    { name: "Code Changes", value: summary.totalCodeChanges },
    { name: "Executions", value: summary.totalExecutions },
    { name: "Submissions", value: summary.totalSubmissions },
    { name: "Hand Raises", value: summary.totalHandRaises },
  ].filter((d) => d.value > 0);

  // Student comparison bar data
  const studentBarData = students.map((s) => ({
    name: s.name.length > 10 ? s.name.slice(0, 10) + "…" : s.name,
    fullName: s.name,
    "Code Changes": s.codeChanges,
    Executions: s.executions,
    "Time (min)": s.timeSpentMinutes,
  }));

  // Line history for selected student
  const selectedStudentData = selectedStudent ? students.find((s) => s.name === selectedStudent) : null;
  const lineHistoryData = selectedStudentData
    ? selectedStudentData.lineHistory.map((h) => ({
        time: new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        lines: h.lines,
      }))
    : [];

  return (
    <div className="min-h-screen">
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div id="analytics-dashboard" className="mx-auto max-w-7xl px-6 pt-24 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8" style={{ animation: "fade-up 0.5s ease-out both" }}>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <svg className="h-8 w-8 text-sky-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
              Analytics Dashboard
            </h1>
            <p className="text-white/40 mt-1">Room: <span className="text-sky-400 font-mono">{roomCode}</span> · Auto-refreshes every 20s</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearData}
              disabled={clearing}
              className="inline-flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-300 ring-1 ring-red-400/30 hover:bg-red-500/30 disabled:opacity-50 transition-all"
            >
              {clearing ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-transparent" />
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
              )}
              Clear Data
            </button>
            <button
              onClick={() => exportCSV(data, roomCode)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 transition-all"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              CSV
            </button>
            <button
              onClick={exportPDF}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-500/20 px-4 py-2.5 text-sm font-semibold text-violet-300 ring-1 ring-violet-400/30 hover:bg-violet-500/30 transition-all"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H6.75a2.25 2.25 0 0 0-2.25 2.25v16.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V14.25Z" />
              </svg>
              PDF
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <StatCard
            delay={0}
            color="sky"
            label="Students"
            value={summary.totalStudents}
            icon={<svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
          />
          <StatCard
            delay={1}
            color="violet"
            label="Code Changes"
            value={summary.totalCodeChanges}
            icon={<svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>}
          />
          <StatCard
            delay={2}
            color="emerald"
            label="Executions"
            value={summary.totalExecutions}
            icon={<svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>}
          />
          <StatCard
            delay={3}
            color="amber"
            label="Submissions"
            value={summary.totalSubmissions}
            icon={<svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
          />
          <StatCard
            delay={4}
            color="rose"
            label="Hand Raises"
            value={summary.totalHandRaises}
            icon={<span className="text-lg">✋</span>}
          />
          <StatCard
            delay={5}
            color="cyan"
            label="Avg Time (min)"
            value={summary.avgTimeSpent}
            icon={<svg className="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
          />
        </div>

        {/* Row 1: Activity Timeline + Activity Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Activity Timeline (wide) */}
          <div className="lg:col-span-2 rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10" style={{ animation: "fade-up 0.6s ease-out 0.2s both" }}>
            <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
              Activity Over Time
            </h3>
            {activityTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="gradCode" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="code_change" name="Code Changes" stroke="#38bdf8" fill="url(#gradCode)" strokeWidth={2} />
                  <Area type="monotone" dataKey="execution" name="Executions" stroke="#34d399" fill="url(#gradExec)" strokeWidth={2} />
                  <Area type="monotone" dataKey="submission" name="Submissions" stroke="#fbbf24" fill="none" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-white/30 text-sm">No activity data yet</div>
            )}
          </div>

          {/* Activity Distribution Pie */}
          <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10" style={{ animation: "fade-up 0.6s ease-out 0.3s both" }}>
            <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>
              Activity Distribution
            </h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value: string) => <span className="text-xs text-white/60">{value}</span>}
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-white/30 text-sm">No data yet</div>
            )}
          </div>
        </div>

        {/* Row 2: Student Comparison + Code Complexity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Student Comparison */}
          <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10" style={{ animation: "fade-up 0.6s ease-out 0.35s both" }}>
            <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
              Student Comparison
            </h3>
            {studentBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={studentBarData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Code Changes" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Executions" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Time (min)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-white/30 text-sm">No student data yet</div>
            )}
          </div>

          {/* Code Complexity - Line count over time for selected student */}
          <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10" style={{ animation: "fade-up 0.6s ease-out 0.4s both" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
                Code Complexity
              </h3>
              <select
                className="rounded-lg bg-black/40 px-2 py-1 text-xs text-white/70 ring-1 ring-white/10 focus:outline-none focus:ring-sky-400/50"
                value={selectedStudent || ""}
                onChange={(e) => setSelectedStudent(e.target.value || null)}
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            {selectedStudent && lineHistoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={lineHistoryData}>
                  <defs>
                    <linearGradient id="gradLines" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: "Lines", angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="lines" name="Lines of Code" stroke="#a78bfa" strokeWidth={2} dot={{ fill: "#a78bfa", r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-white/30 text-sm">
                {selectedStudent ? "No code history for this student" : "Select a student to view code complexity"}
              </div>
            )}
          </div>
        </div>

        {/* Student Details Table */}
        <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-5 ring-1 ring-white/10" style={{ animation: "fade-up 0.6s ease-out 0.5s both" }}>
          <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
            <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12v-1.5c0 .621.504 1.125 1.125 1.125M12 12c0 .621-.504 1.125-1.125 1.125M12 12c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h1.5" /></svg>
            Student Performance Details
          </h3>
          {students.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-white/5">
                    <th className="text-left py-2 px-3 font-semibold">Student</th>
                    <th className="text-center py-2 px-3 font-semibold">Code Changes</th>
                    <th className="text-center py-2 px-3 font-semibold">Executions</th>
                    <th className="text-center py-2 px-3 font-semibold">Submissions</th>
                    <th className="text-center py-2 px-3 font-semibold">Hand Raises</th>
                    <th className="text-center py-2 px-3 font-semibold">Max Lines</th>
                    <th className="text-center py-2 px-3 font-semibold">Max Chars</th>
                    <th className="text-center py-2 px-3 font-semibold">Time (min)</th>
                    <th className="text-center py-2 px-3 font-semibold">Languages</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${["from-sky-400 to-blue-500", "from-emerald-400 to-teal-500", "from-amber-400 to-orange-500", "from-rose-400 to-pink-500", "from-violet-400 to-purple-500"][i % 5]} text-[10px] font-bold text-white`}>
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-white">{s.name}</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 px-3 text-white/70 font-mono">{s.codeChanges}</td>
                      <td className="text-center py-2.5 px-3 text-white/70 font-mono">{s.executions}</td>
                      <td className="text-center py-2.5 px-3">
                        {s.submissions > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300 ring-1 ring-emerald-400/30">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                            {s.submissions}
                          </span>
                        ) : (
                          <span className="text-white/30">0</span>
                        )}
                      </td>
                      <td className="text-center py-2.5 px-3">
                        {s.handRaises > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-300 ring-1 ring-amber-400/30">
                            ✋ {s.handRaises}
                          </span>
                        ) : (
                          <span className="text-white/30">0</span>
                        )}
                      </td>
                      <td className="text-center py-2.5 px-3 text-white/70 font-mono">{s.maxLines}</td>
                      <td className="text-center py-2.5 px-3 text-white/70 font-mono">{s.maxChars}</td>
                      <td className="text-center py-2.5 px-3 text-white/70 font-mono">{s.timeSpentMinutes}</td>
                      <td className="text-center py-2.5 px-3">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {s.languages.map((l) => (
                            <span key={l} className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-300 ring-1 ring-sky-400/30">{l}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-white/30 text-sm">No student data yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
