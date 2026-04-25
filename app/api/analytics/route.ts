import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

let _client: MongoClient | null = null;
async function getDb() {
  if (!_client) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    _client = await new MongoClient(uri).connect();
  }
  return _client.db();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get("room");
  if (!roomCode) {
    return NextResponse.json({ error: "room param required" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const col = db.collection("analytics_events");

    // Fetch all events for this room (and its private rooms)
    const events = await col
      .find({
        $or: [{ roomCode }, { mainRoom: roomCode }],
      })
      .sort({ timestamp: 1 })
      .toArray();

    // ── Derive analytics from raw events ──

    // 1. Activity timeline (events per minute, bucketed by raw timestamp)
    const timeline: Record<number, { code_change: number; execution: number; submission: number; hand_raise: number }> = {};
    for (const e of events) {
      // Bucket to nearest minute using raw ms timestamp
      const bucket = Math.floor(e.timestamp / 60000) * 60000;
      if (!timeline[bucket]) timeline[bucket] = { code_change: 0, execution: 0, submission: 0, hand_raise: 0 };
      if (e.type === "code_change") timeline[bucket].code_change++;
      if (e.type === "execution") timeline[bucket].execution++;
      if (e.type === "submission") timeline[bucket].submission++;
      if (e.type === "hand_raise") timeline[bucket].hand_raise++;
    }
    const activityTimeline = Object.entries(timeline).map(([ts, counts]) => ({
      timestamp: Number(ts),
      ...counts,
    }));

    // 2. Per-student metrics
    const studentMap: Record<string, {
      codeChanges: number;
      executions: number;
      submissions: number;
      handRaises: number;
      maxLines: number;
      maxChars: number;
      firstSeen: number;
      lastSeen: number;
      languages: Set<string>;
      lineHistory: { timestamp: number; lines: number }[];
    }> = {};

    for (const e of events) {
      const name = e.studentName;
      if (!name || name === "Anonymous" || e.role === "instructor") continue;
      if (!studentMap[name]) {
        studentMap[name] = {
          codeChanges: 0, executions: 0, submissions: 0, handRaises: 0,
          maxLines: 0, maxChars: 0, firstSeen: e.timestamp, lastSeen: e.timestamp,
          languages: new Set(), lineHistory: [],
        };
      }
      const s = studentMap[name];
      s.lastSeen = Math.max(s.lastSeen, e.timestamp);
      s.firstSeen = Math.min(s.firstSeen, e.timestamp);

      if (e.type === "code_change") {
        s.codeChanges++;
        s.maxLines = Math.max(s.maxLines, e.lineCount || 0);
        s.maxChars = Math.max(s.maxChars, e.codeLength || 0);
        s.lineHistory.push({ timestamp: e.timestamp, lines: e.lineCount || 0 });
      }
      if (e.type === "execution") {
        s.executions++;
        if (e.language) s.languages.add(e.language);
      }
      if (e.type === "submission") s.submissions++;
      if (e.type === "hand_raise" && e.handRaised) s.handRaises++;
    }

    const students = Object.entries(studentMap).map(([name, s]) => ({
      name,
      codeChanges: s.codeChanges,
      executions: s.executions,
      submissions: s.submissions,
      handRaises: s.handRaises,
      maxLines: s.maxLines,
      maxChars: s.maxChars,
      timeSpentMinutes: Math.round((s.lastSeen - s.firstSeen) / 60000),
      languages: Array.from(s.languages),
      lineHistory: s.lineHistory,
    }));

    // 3. Code complexity over time (aggregate line counts from code_change events)
    const complexityTimeline = events
      .filter((e) => e.type === "code_change" && e.role !== "instructor" && e.studentName !== "Anonymous")
      .map((e) => ({
        timestamp: e.timestamp,
        studentName: e.studentName,
        lines: e.lineCount || 0,
        chars: e.codeLength || 0,
      }));

    // 4. Heatmap data: code edits per student per hour-of-day
    const heatmapMap: Record<string, Record<number, number>> = {};
    for (const e of events) {
      if (e.type !== "code_change" || e.role === "instructor" || e.studentName === "Anonymous") continue;
      const name = e.studentName;
      const hour = new Date(e.timestamp).getHours();
      if (!heatmapMap[name]) heatmapMap[name] = {};
      heatmapMap[name][hour] = (heatmapMap[name][hour] || 0) + 1;
    }
    const heatmap = Object.entries(heatmapMap).map(([name, hours]) => ({
      name,
      hours: Array.from({ length: 24 }, (_, i) => hours[i] || 0),
    }));

    // 5. Summary stats
    const summary = {
      totalEvents: events.length,
      totalStudents: students.length,
      totalCodeChanges: events.filter((e) => e.type === "code_change").length,
      totalExecutions: events.filter((e) => e.type === "execution").length,
      totalSubmissions: events.filter((e) => e.type === "submission").length,
      totalHandRaises: events.filter((e) => e.type === "hand_raise" && e.handRaised).length,
      avgTimeSpent: students.length > 0 ? Math.round(students.reduce((a, s) => a + s.timeSpentMinutes, 0) / students.length) : 0,
    };

    return NextResponse.json({
      summary,
      activityTimeline,
      students,
      complexityTimeline,
      heatmap,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
