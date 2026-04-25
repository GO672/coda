"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io({
      transports: ["websocket", "polling"],
    });
  }
  return globalSocket;
}

export type CursorData = {
  id: string;
  name: string;
  role: string;
  line: number;
  ch: number;
  selStart?: number;
  selEnd?: number;
};

export function useSocket(roomCode: string | null, name: string, role: "instructor" | "student") {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!roomCode) return;

    const s = getSocket();
    setSocket(s);

    function joinRoom() {
      s.emit("join-room", { roomCode, name, role });
    }

    function onConnect() {
      setConnected(true);
      joinRoom();
    }

    function onDisconnect() {
      setConnected(false);
    }

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    // If already connected, join immediately
    if (s.connected) {
      setConnected(true);
      joinRoom();
    } else {
      s.connect();
    }

    // Notify server immediately when user leaves the page
    function onBeforeUnload() {
      s.emit("leave-room");
    }
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Also emit leave-room on effect cleanup (e.g. navigating away via SPA)
      s.emit("leave-room");
    };
  }, [roomCode, name, role]);

  return { socket, connected };
}
