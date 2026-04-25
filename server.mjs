import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { MongoClient } from "mongodb";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Language runtime configurations for local execution
const LANG_CONFIG = {
  python: { ext: ".py", cmd: (f) => ["python", ["-u", f]] },
  javascript: { ext: ".js", cmd: (f) => ["node", [f]] },
  typescript: { ext: ".ts", cmd: (f) => ["npx", ["ts-node", "--esm", f]] },
  c: {
    ext: ".c",
    compile: (f, out) => ["gcc", [f, "-o", out + ".exe"]],
    cmd: (_f, out) => [out + ".exe", []],
  },
  cpp: {
    ext: ".cpp",
    compile: (f, out) => ["g++", [f, "-o", out + ".exe"]],
    cmd: (_f, out) => [out + ".exe", []],
  },
  java: {
    ext: ".java",
    compile: (f) => ["javac", [f]],
    cmd: (f) => {
      const dir = f.replace(/[/\\][^/\\]+$/, "");
      const cls = f.replace(/^.*[/\\]/, "").replace(/\.java$/, "");
      return ["java", ["-cp", dir, cls]];
    },
  },
  ruby: { ext: ".rb", cmd: (f) => ["ruby", [f]] },
  go: { ext: ".go", cmd: (f) => ["go", ["run", f]] },
  rust: {
    ext: ".rs",
    compile: (f, out) => ["rustc", [f, "-o", out + ".exe"]],
    cmd: (_f, out) => [out + ".exe", []],
  },
  php: { ext: ".php", cmd: (f) => ["php", [f]] },
  csharp: {
    ext: ".cs",
    cmd: (f) => ["dotnet-script", [f]],
  },
};

// Active processes per socket
const activeProcesses = new Map();

// Throttle analytics: only log code_change once per 5s per socket
const analyticsThrottle = new Map();

let _mongoClient = null;
async function getDb() {
  if (!_mongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    _mongoClient = await new MongoClient(uri).connect();
  }
  return _mongoClient.db();
}

// ── Analytics: log events to MongoDB ──
async function logAnalytics(event) {
  try {
    const db = await getDb();
    await db.collection("analytics_events").insertOne({
      ...event,
      timestamp: Date.now(),
    });
  } catch (e) {
    // Silently fail — analytics should never break the app
  }
}

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    pingTimeout: 5000,
    pingInterval: 3000,
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB to support file/image uploads
  });

  // Track rooms: roomCode -> { code, cursors: Map<socketId, cursorData>, students: Set<socketId>, users: Map<socketId, {name, role}>, messages: [] }
  const rooms = new Map();

  // Track private rooms: privateRoomCode -> { mainRoom, studentSocketId, studentName, instructorSocketId, instructorName, createdAt }
  const privateRooms = new Map();

  function generatePrivateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "PR-";
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  // Helper: broadcast the full active-user list for a room
  function broadcastRoomUsers(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    const users = [];
    for (const [id, u] of room.users.entries()) {
      users.push({ id, name: u.name, role: u.role });
    }
    io.to(roomCode).emit("room-users", users);
  }

  // Helper: resolve main room for any room code (private rooms map back to their main room)
  function resolveMainRoom(roomCode) {
    const pr = privateRooms.get(roomCode);
    return pr ? pr.mainRoom : roomCode;
  }

  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);
    let currentRoom = null;
    let userName = "Anonymous";
    let userRole = "student";

    socket.on("join-room", async ({ roomCode, name, role }) => {
      currentRoom = roomCode;
      userName = name || "Anonymous";
      userRole = role || "student";
      socket.join(roomCode);

      if (!rooms.has(roomCode)) {
        // Seed from MongoDB so the first joiner gets persisted code
        let savedCode = "";
        try {
          const db = await getDb();
          const doc = await db.collection("rooms").findOne({ code: roomCode });
          if (doc?.codeContent) savedCode = doc.codeContent;
        } catch (e) {
          console.error("Failed to seed room code from DB:", e);
        }
        rooms.set(roomCode, { code: savedCode, cursors: new Map(), students: new Set(), users: new Map(), messages: [] });
      }

      const room = rooms.get(roomCode);

      // Send current code state (and language) to the newly joined user
      socket.emit("code-sync", { code: room.code, language: room.language || null });

      // Send existing cursors to the newly joined user
      for (const [sid, cursor] of room.cursors.entries()) {
        if (sid !== socket.id) {
          socket.emit("cursor-update", cursor);
        }
      }

      // Send chat history to the newly joined user
      if (room.messages && room.messages.length > 0) {
        socket.emit("chat-history", room.messages);
      }

      // Track students
      if (userRole === "student") {
        room.students.add(socket.id);
      }

      // Track all users (instructor + students)
      room.users.set(socket.id, { name: userName, role: userRole });

      console.log(`[socket] ${socket.id} joined room ${roomCode} as ${userRole} (${userName}), students: ${room.students.size}`);

      // Analytics: track join (only for private rooms)
      if (roomCode.startsWith("PR-")) {
        logAnalytics({ type: "join", roomCode, mainRoom: resolveMainRoom(roomCode), studentName: userName, role: userRole });
      }

      // Broadcast updated stats to everyone in the room
      io.to(roomCode).emit("stats-update", {
        totalStudents: room.students.size,
      });

      // Broadcast updated user list
      broadcastRoomUsers(roomCode);

      // Notify others
      socket.to(roomCode).emit("user-joined", {
        id: socket.id,
        name: userName,
        role: userRole,
      });

      // If instructor, send their private rooms list immediately
      if (userRole === "instructor") {
        // If instructor just joined a private room, clear hand raised & submitted
        const prData = privateRooms.get(roomCode);
        if (prData && prData.instructorName === userName) {
          prData.handRaised = false;
          prData.submitted = false;
          // Tell the student in this room to reset their submit button
          socket.to(roomCode).emit("submit-task-update", { submitted: false });
          socket.to(roomCode).emit("hand-raise-update", { handRaised: false });
        }

        // Send updated list (covers both main room and private room joins)
        const mainRoomForList = prData ? prData.mainRoom : roomCode;
        const prList = buildPrivateRoomsList(mainRoomForList, userName);
        if (prList.length > 0) {
          socket.emit("private-rooms-list", prList);
        }
      }

      // If student, check if they have an existing private room and notify them
      if (userRole === "student") {
        for (const [prCode, pr] of privateRooms.entries()) {
          if (pr.mainRoom === roomCode && pr.studentName === userName) {
            socket.emit("your-private-room", { privateRoomCode: prCode, instructorName: pr.instructorName, mainRoom: roomCode });
            break;
          }
        }
        // If student just joined a private room, notify the instructor so active status updates
        const prData = privateRooms.get(roomCode);
        if (prData) {
          // Find instructor sockets in main room or other private rooms and send updated list
          const mainRoomData = rooms.get(prData.mainRoom);
          if (mainRoomData) {
            for (const [sid, u] of mainRoomData.users.entries()) {
              if (u.name === prData.instructorName && u.role === "instructor") {
                io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(prData.mainRoom, prData.instructorName));
              }
            }
          }
          for (const [prCode2, prItem] of privateRooms.entries()) {
            if (prItem.instructorName === prData.instructorName) {
              const prRoomData = rooms.get(prCode2);
              if (prRoomData) {
                for (const [sid, u] of prRoomData.users.entries()) {
                  if (u.name === prData.instructorName && u.role === "instructor") {
                    io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(prData.mainRoom, prData.instructorName));
                  }
                }
              }
            }
          }
        }
      }
    });

    // ── WebRTC voice signaling (1-to-1 private rooms) ──
    socket.on("voice-offer", ({ roomCode, offer }) => {
      if (!roomCode) return;
      socket.to(roomCode).emit("voice-offer", { offer, from: socket.id });
    });
    socket.on("voice-answer", ({ roomCode, answer }) => {
      if (!roomCode) return;
      socket.to(roomCode).emit("voice-answer", { answer, from: socket.id });
    });
    socket.on("voice-ice-candidate", ({ roomCode, candidate }) => {
      if (!roomCode) return;
      socket.to(roomCode).emit("voice-ice-candidate", { candidate, from: socket.id });
    });
    socket.on("voice-hangup", ({ roomCode }) => {
      if (!roomCode) return;
      socket.to(roomCode).emit("voice-hangup", { from: socket.id });
    });
    socket.on("voice-mute-status", ({ roomCode, muted }) => {
      if (!roomCode) return;
      socket.to(roomCode).emit("voice-mute-status", { muted, from: socket.id });
    });

    // ── Group voice signaling (mesh, main rooms) ──
    socket.on("group-voice-join", ({ roomCode }) => {
      if (!roomCode) return;
      // Tell everyone else in the room that this peer wants to join voice
      socket.to(roomCode).emit("group-voice-join", { peerId: socket.id });
    });
    socket.on("group-voice-offer", ({ to, offer }) => {
      if (!to) return;
      io.to(to).emit("group-voice-offer", { offer, from: socket.id });
    });
    socket.on("group-voice-answer", ({ to, answer }) => {
      if (!to) return;
      io.to(to).emit("group-voice-answer", { answer, from: socket.id });
    });
    socket.on("group-voice-ice", ({ to, candidate }) => {
      if (!to) return;
      io.to(to).emit("group-voice-ice", { candidate, from: socket.id });
    });
    socket.on("group-voice-mute", ({ roomCode, muted }) => {
      if (!roomCode) return;
      socket.to(roomCode).emit("group-voice-mute", { peerId: socket.id, muted });
    });

    // Direct mute state to a specific peer (used when a new user joins so existing users tell them their mute state)
    socket.on("group-voice-mute-to", ({ to, muted }) => {
      if (!to) return;
      io.to(to).emit("group-voice-mute", { peerId: socket.id, muted });
    });

    // Chat message handlers
    socket.on("chat-message", ({ roomCode, message, file }) => {
      if (!roomCode || !message) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      const chatMessage = {
        id: `${socket.id}-${Date.now()}`,
        senderId: socket.id,
        senderName: userName,
        senderRole: userRole,
        text: message,
        timestamp: Date.now(),
        ...(file && { file }), // Include file data if present
      };

      // Store message in room history (keep last 100 messages)
      room.messages.push(chatMessage);
      if (room.messages.length > 100) {
        room.messages.shift();
      }

      // Broadcast to everyone in the room (including sender for confirmation)
      io.to(roomCode).emit("chat-message", chatMessage);
    });

    socket.on("language-change", ({ roomCode, language }) => {
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (room) room.language = language;
      socket.to(roomCode).emit("language-update", { language });
    });

    socket.on("code-change", ({ roomCode, code }) => {
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (room) {
        room.code = code;
      }
      // Broadcast to everyone else in the room
      socket.to(roomCode).emit("code-update", { code });

      // Analytics: track code change with metrics (throttled to 1 per 5s per socket, only for private rooms)
      if (roomCode.startsWith("PR-")) {
        const now = Date.now();
        const lastLog = analyticsThrottle.get(socket.id) || 0;
        if (now - lastLog >= 5000) {
          analyticsThrottle.set(socket.id, now);
          const lines = (code || "").split("\n").length;
          const chars = (code || "").length;
          logAnalytics({ type: "code_change", roomCode, mainRoom: resolveMainRoom(roomCode), studentName: userName, role: userRole, codeLength: chars, lineCount: lines });
        }
      }
    });

    socket.on("cursor-move", ({ roomCode, cursor }) => {
      if (!roomCode) return;
      const cursorData = {
        id: socket.id,
        name: userName,
        role: userRole,
        ...cursor,
      };
      const room = rooms.get(roomCode);
      if (room) {
        room.cursors.set(socket.id, cursorData);
      }
      socket.to(roomCode).emit("cursor-update", cursorData);
    });

    socket.on("output-update", ({ roomCode, output }) => {
      if (!roomCode) return;
      console.log(`[socket] output-update from ${socket.id} to room ${roomCode}, length=${(output || "").length}`);
      socket.to(roomCode).emit("output-update", { output });
    });

    // ── Real-time code execution via child_process ──
    socket.on("execute-code", ({ roomCode, code, language }) => {
      if (!roomCode || !code || !language) return;

      // Kill any existing process for this socket
      const existing = activeProcesses.get(socket.id);
      if (existing) {
        try { existing.kill("SIGKILL"); } catch {}
        activeProcesses.delete(socket.id);
      }

      const config = LANG_CONFIG[language];
      if (!config) {
        socket.emit("execute-stdout", { data: `Error: Unsupported language "${language}"\r\n` });
        socket.emit("execute-exit", { code: 1 });
        return;
      }

      // Write code to a temp file
      const tmpDir = join(tmpdir(), "lch-exec");
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
      let fileBase = `run_${socket.id.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

      // Java requires filename to match the public class name
      if (language === "java") {
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        if (classMatch) fileBase = classMatch[1];
        else fileBase = "Main";
      }

      const srcFile = join(tmpDir, fileBase + config.ext);
      const outFile = join(tmpDir, fileBase);

      // For Python: prepend line-buffering to guarantee real-time output streaming
      let finalCode = code;
      if (language === "python") {
        finalCode = "import sys; sys.stdout.reconfigure(line_buffering=True)\n" + code;
      }

      try {
        writeFileSync(srcFile, finalCode, "utf-8");
      } catch (err) {
        socket.emit("execute-stdout", { data: `Error writing source file: ${err.message}\r\n` });
        socket.emit("execute-exit", { code: 1 });
        return;
      }

      console.log(`[exec] ${socket.id} executing ${language} in room ${roomCode}`);

      // Analytics: track execution (only for private rooms)
      if (roomCode.startsWith("PR-")) {
        const execLines = (code || "").split("\n").length;
        logAnalytics({ type: "execution", roomCode, mainRoom: resolveMainRoom(roomCode), studentName: userName, role: userRole, language, lineCount: execLines, codeLength: (code || "").length });
      }

      function runProcess(command, args) {
        const proc = spawn(command, args, {
          cwd: tmpDir,
          env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1" },
          shell: process.platform === "win32",
          stdio: ["pipe", "pipe", "pipe"],
        });

        activeProcesses.set(socket.id, proc);

        proc.stdout.on("data", (chunk) => {
          const text = chunk.toString();
          socket.emit("execute-stdout", { data: text });
          // Also broadcast to students in the room
          socket.to(roomCode).emit("execute-stdout", { data: text });
        });

        proc.stderr.on("data", (chunk) => {
          const text = chunk.toString();
          socket.emit("execute-stderr", { data: text });
          socket.to(roomCode).emit("execute-stderr", { data: text });
        });

        proc.on("error", (err) => {
          const msg = `Error: ${err.message}\r\n`;
          socket.emit("execute-stderr", { data: msg });
          socket.to(roomCode).emit("execute-stderr", { data: msg });
        });

        proc.on("close", (exitCode) => {
          activeProcesses.delete(socket.id);
          socket.emit("execute-exit", { code: exitCode ?? 0 });
          socket.to(roomCode).emit("execute-exit", { code: exitCode ?? 0 });
          // Cleanup temp files
          try { unlinkSync(srcFile); } catch {}
          try { unlinkSync(outFile + ".exe"); } catch {}
          try { unlinkSync(outFile + ".class"); } catch {}
          try { unlinkSync(outFile + ".jar"); } catch {}
          console.log(`[exec] ${socket.id} process exited with code ${exitCode}`);
        });
      }

      // If language needs compilation, compile first
      if (config.compile) {
        const [compCmd, compArgs] = config.compile(srcFile, outFile);
        const compileProc = spawn(compCmd, compArgs, {
          cwd: tmpDir,
          env: { ...process.env },
          shell: process.platform === "win32",
        });

        let compileError = "";
        compileProc.stderr.on("data", (chunk) => {
          compileError += chunk.toString();
        });
        compileProc.stdout.on("data", (chunk) => {
          compileError += chunk.toString();
        });

        compileProc.on("close", (exitCode) => {
          if (exitCode !== 0) {
            const msg = compileError || `Compilation failed with exit code ${exitCode}`;
            socket.emit("execute-stderr", { data: msg + "\r\n" });
            socket.to(roomCode).emit("execute-stderr", { data: msg + "\r\n" });
            socket.emit("execute-exit", { code: exitCode ?? 1 });
            socket.to(roomCode).emit("execute-exit", { code: exitCode ?? 1 });
            try { unlinkSync(srcFile); } catch {}
            return;
          }
          // Compilation succeeded, now run
          const [cmd, args] = config.cmd(srcFile, outFile);
          runProcess(cmd, args);
        });
      } else {
        const [cmd, args] = config.cmd(srcFile, outFile);
        runProcess(cmd, args);
      }
    });

    // Send stdin to the running process and echo to all clients
    socket.on("execute-stdin", ({ data }) => {
      const proc = activeProcesses.get(socket.id);
      if (proc && proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write(data + "\n");
      }
      // Echo the typed input + newline to ALL clients.
      // Piped stdin doesn't echo like a real terminal, so we simulate it:
      // the user's input appears after the prompt, then a newline separates the next output.
      if (currentRoom) {
        const echo = data + "\n";
        socket.emit("execute-stdout", { data: echo });
        socket.to(currentRoom).emit("execute-stdout", { data: echo });
      }
    });

    // Kill the running process
    socket.on("execute-kill", () => {
      const proc = activeProcesses.get(socket.id);
      if (proc) {
        try { proc.kill("SIGKILL"); } catch {}
        activeProcesses.delete(socket.id);
      }
    });

    // ── Helper: build private rooms list with active status ──
    function buildPrivateRoomsList(mainRoomCode, instructorName) {
      const list = [];
      for (const [code, pr] of privateRooms.entries()) {
        if (pr.mainRoom === mainRoomCode && pr.instructorName === instructorName) {
          // Check if the student is currently in the private room
          const prRoom = rooms.get(code);
          const studentActive = prRoom ? Array.from(prRoom.users.values()).some(u => u.name === pr.studentName && u.role === "student") : false;
          list.push({ code, studentName: pr.studentName, createdAt: pr.createdAt, mainRoom: pr.mainRoom, studentActive, lastLeftAt: pr.lastLeftAt || null, handRaised: pr.handRaised || false, submitted: pr.submitted || false });
        }
      }
      return list;
    }

    // ── Private rooms ──
    socket.on("create-private-room", ({ mainRoom: mainRoomCode, studentSocketId, studentName }) => {
      if (userRole !== "instructor") return;

      // Check if student already has a private room in this main room
      for (const [existingCode, pr] of privateRooms.entries()) {
        if (pr.mainRoom === mainRoomCode && pr.studentName === (studentName || "Student")) {
          socket.emit("private-room-error", { message: `${studentName} already has a private room.`, existingCode });
          return;
        }
      }

      const prCode = generatePrivateCode();
      const prData = {
        code: prCode,
        mainRoom: mainRoomCode,
        studentSocketId,
        studentName: studentName || "Student",
        instructorSocketId: socket.id,
        instructorName: userName,
        createdAt: Date.now(),
      };
      privateRooms.set(prCode, prData);
      console.log(`[private-room] created ${prCode} for student ${studentName} (${studentSocketId}) by instructor ${userName}`);

      // Notify the instructor with the updated list
      socket.emit("private-rooms-list", buildPrivateRoomsList(mainRoomCode, userName));

      // Notify the student to redirect to the private room
      io.to(studentSocketId).emit("private-room-invite", { privateRoomCode: prCode, instructorName: userName, mainRoom: mainRoomCode });
    });

    socket.on("get-private-rooms", ({ mainRoom: mainRoomCode }) => {
      socket.emit("private-rooms-list", buildPrivateRoomsList(mainRoomCode, userName));
    });

    // ── Hand raise ──
    socket.on("raise-hand", ({ privateRoomCode }) => {
      const pr = privateRooms.get(privateRoomCode);
      if (!pr) return;
      pr.handRaised = !pr.handRaised;

      // Analytics: track hand raise
      logAnalytics({ type: "hand_raise", roomCode: privateRoomCode, mainRoom: pr.mainRoom, studentName: pr.studentName, handRaised: pr.handRaised });

      // Notify instructor with updated list
      const mainRoomData = rooms.get(pr.mainRoom);
      if (mainRoomData) {
        for (const [sid, u] of mainRoomData.users.entries()) {
          if (u.name === pr.instructorName && u.role === "instructor") {
            io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(pr.mainRoom, pr.instructorName));
          }
        }
      }
      // Also notify instructor if they're in any private room
      for (const [prCode2, prItem] of privateRooms.entries()) {
        if (prItem.instructorName === pr.instructorName) {
          const prRoomData = rooms.get(prCode2);
          if (prRoomData) {
            for (const [sid, u] of prRoomData.users.entries()) {
              if (u.name === pr.instructorName && u.role === "instructor") {
                io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(pr.mainRoom, pr.instructorName));
              }
            }
          }
        }
      }
      // Notify the student back with the current state
      socket.emit("hand-raise-update", { handRaised: pr.handRaised });
    });

    // ── Submit task ──
    socket.on("submit-task", ({ privateRoomCode }) => {
      const pr = privateRooms.get(privateRoomCode);
      if (!pr) return;
      pr.submitted = true;

      // Analytics: track submission
      logAnalytics({ type: "submission", roomCode: privateRoomCode, mainRoom: pr.mainRoom, studentName: pr.studentName });

      // Notify instructor with updated list
      const mainRoomData = rooms.get(pr.mainRoom);
      if (mainRoomData) {
        for (const [sid, u] of mainRoomData.users.entries()) {
          if (u.name === pr.instructorName && u.role === "instructor") {
            io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(pr.mainRoom, pr.instructorName));
          }
        }
      }
      for (const [prCode2, prItem] of privateRooms.entries()) {
        if (prItem.instructorName === pr.instructorName) {
          const prRoomData = rooms.get(prCode2);
          if (prRoomData) {
            for (const [sid, u] of prRoomData.users.entries()) {
              if (u.name === pr.instructorName && u.role === "instructor") {
                io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(pr.mainRoom, pr.instructorName));
              }
            }
          }
        }
      }
      // Notify the student back
      socket.emit("submit-task-update", { submitted: true });
    });

    // ── End private session ──
    socket.on("end-private-session", ({ privateRoomCode }) => {
      const pr = privateRooms.get(privateRoomCode);
      if (!pr) return;
      const mainRoomCode = pr.mainRoom;
      const instructorName = pr.instructorName;

      console.log(`[private-room] ending session ${privateRoomCode} (student: ${pr.studentName})`);

      // Notify everyone in the private room to go back to main room
      const prRoom = rooms.get(privateRoomCode);
      if (prRoom) {
        for (const [sid] of prRoom.users.entries()) {
          io.to(sid).emit("session-ended", { mainRoom: mainRoomCode });
        }
      }

      // Delete the private room
      privateRooms.delete(privateRoomCode);
      if (prRoom) {
        rooms.delete(privateRoomCode);
      }

      // Notify instructor with updated list (wherever they are)
      const mainRoomData = rooms.get(mainRoomCode);
      if (mainRoomData) {
        for (const [sid, u] of mainRoomData.users.entries()) {
          if (u.name === instructorName && u.role === "instructor") {
            io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(mainRoomCode, instructorName));
          }
        }
      }
      // Also check other private rooms for the instructor
      for (const [prCode2, prItem] of privateRooms.entries()) {
        if (prItem.instructorName === instructorName) {
          const prRoomData = rooms.get(prCode2);
          if (prRoomData) {
            for (const [sid, u] of prRoomData.users.entries()) {
              if (u.name === instructorName && u.role === "instructor") {
                io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(mainRoomCode, instructorName));
              }
            }
          }
        }
      }
    });

    // Helper: if someone leaves a private room, notify the instructor so active status updates
    function notifyInstructorAfterLeave(leftRoom) {
      // Check if the left room is a private room
      const pr = privateRooms.get(leftRoom);
      if (!pr) return;
      // Record when the student left so the timer resets
      if (userRole === "student") {
        pr.lastLeftAt = Date.now();
      }
      // Find the instructor's socket in the main room (or any room) and send updated list
      const mainRoomData = rooms.get(pr.mainRoom);
      if (!mainRoomData) return;
      for (const [sid, u] of mainRoomData.users.entries()) {
        if (u.name === pr.instructorName && u.role === "instructor") {
          io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(pr.mainRoom, pr.instructorName));
        }
      }
      // Also check if instructor is currently in any private room
      for (const [prCode, prItem] of privateRooms.entries()) {
        if (prItem.instructorName === pr.instructorName) {
          const prRoomData = rooms.get(prCode);
          if (prRoomData) {
            for (const [sid, u] of prRoomData.users.entries()) {
              if (u.name === pr.instructorName && u.role === "instructor") {
                io.to(sid).emit("private-rooms-list", buildPrivateRoomsList(pr.mainRoom, pr.instructorName));
              }
            }
          }
        }
      }
    }

    // Explicit leave (fired by client on beforeunload / cleanup)
    socket.on("leave-room", () => {
      if (currentRoom) {
        const leftRoom = currentRoom;
        const room = rooms.get(currentRoom);
        if (room) {
          room.cursors.delete(socket.id);
          room.students.delete(socket.id);
          room.users.delete(socket.id);
          io.to(currentRoom).emit("stats-update", { totalStudents: room.students.size });
          broadcastRoomUsers(currentRoom);
        }
        socket.to(currentRoom).emit("cursor-remove", { id: socket.id });
        socket.leave(currentRoom);
        console.log(`[socket] ${socket.id} left room ${currentRoom} explicitly, students: ${room?.students.size}`);
        currentRoom = null;
        notifyInstructorAfterLeave(leftRoom);
      }
    });

    socket.on("disconnect", () => {
      // Kill any running process for this socket
      const proc = activeProcesses.get(socket.id);
      if (proc) {
        try { proc.kill("SIGKILL"); } catch {}
        activeProcesses.delete(socket.id);
      }
      console.log(`[socket] disconnected: ${socket.id} (room: ${currentRoom}, role: ${userRole})`);

      // Analytics: track leave (only for private rooms)
      if (currentRoom && currentRoom.startsWith("PR-")) {
        logAnalytics({ type: "leave", roomCode: currentRoom, mainRoom: resolveMainRoom(currentRoom), studentName: userName, role: userRole });
      }
      if (currentRoom) {
        const leftRoom = currentRoom;
        const room = rooms.get(currentRoom);
        if (room) {
          room.cursors.delete(socket.id);
          room.students.delete(socket.id);
          room.users.delete(socket.id);

          console.log(`[socket] room ${currentRoom} students after leave: ${room.students.size}`);

          // Broadcast updated stats to remaining members
          io.to(currentRoom).emit("stats-update", {
            totalStudents: room.students.size,
          });

          // Broadcast updated user list
          broadcastRoomUsers(currentRoom);
        }
        socket.to(currentRoom).emit("cursor-remove", { id: socket.id });
        socket.to(currentRoom).emit("user-left", {
          id: socket.id,
          name: userName,
          role: userRole,
        });
        notifyInstructorAfterLeave(leftRoom);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
