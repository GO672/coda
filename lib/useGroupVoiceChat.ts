"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

type PeerState = {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  analyser: AnalyserNode | null;
  audioCtx: AudioContext | null;
  level: number;
  muted: boolean;
};

export function useGroupVoiceChat(socket: Socket | null, roomCode: string) {
  const [micOn, setMicOn] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [peerStates, setPeerStates] = useState<Record<string, { level: number; muted: boolean }>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const autoJoinedRef = useRef(false);
  const socketRef = useRef(socket);
  const roomCodeRef = useRef(roomCode);
  const micOnRef = useRef(false);
  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const [localLevel, setLocalLevel] = useState(0);
  const rafRef = useRef<number>(0);
  socketRef.current = socket;
  roomCodeRef.current = roomCode;
  micOnRef.current = micOn;

  // Create a peer connection to a specific remote peer
  const createPeer = useCallback((peerId: string, stream: MediaStream, isInitiator: boolean) => {
    const s = socketRef.current;
    if (!s) return null;

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        s.emit("group-voice-ice", { to: peerId, candidate: e.candidate });
      }
    };

    // Remote audio
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;

    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
      // Set up analyser for remote level
      try {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.3;
        const source = audioCtx.createMediaStreamSource(e.streams[0]);
        source.connect(analyser);
        const peer = peersRef.current.get(peerId);
        if (peer) {
          peer.analyser = analyser;
          peer.audioCtx = audioCtx;
        }
      } catch (err) {
        console.error("[group-voice] analyser error", err);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        removePeer(peerId);
      }
    };

    const peerState: PeerState = { pc, audioEl, analyser: null, audioCtx: null, level: 0, muted: false };
    peersRef.current.set(peerId, peerState);

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          s.emit("group-voice-offer", { to: peerId, offer: pc.localDescription });
        } catch (err) {
          console.error("[group-voice] offer error", err);
        }
      };
    }

    return pc;
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peer.audioEl.srcObject = null;
      peer.audioCtx?.close();
      peersRef.current.delete(peerId);
      setPeerStates((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }
  }, []);

  // Join voice
  const joinVoice = useCallback(async () => {
    const s = socketRef.current;
    const rc = roomCodeRef.current;
    if (!s || !rc) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // Restore mute state from localStorage so refresh keeps the same mute
      const wasMuted = localStorage.getItem("voice-muted") === "true";
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && wasMuted) {
        audioTrack.enabled = false;
      }
      const startingMicOn = !wasMuted;
      setMicOn(startingMicOn);
      setInCall(true);

      // Set up local level monitoring
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      localAudioCtxRef.current = ctx;
      localAnalyserRef.current = analyser;

      // Tell everyone in the room we joined voice
      s.emit("group-voice-join", { roomCode: rc });

      // Broadcast our mute state so others immediately see the correct status
      if (wasMuted) {
        s.emit("group-voice-mute", { roomCode: rc, muted: true });
      }
    } catch (err) {
      console.error("[group-voice] mic error", err);
    }
  }, []);

  // Auto-join
  useEffect(() => {
    if (!socket || !roomCode || autoJoinedRef.current || inCall) return;
    autoJoinedRef.current = true;
    joinVoice();
  }, [socket, roomCode, inCall, joinVoice]);

  // Level monitoring loop
  useEffect(() => {
    const localData = new Float32Array(2048);

    function rms(data: any): number {
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / data.length);
    }

    function tick() {
      // Local level
      if (localAnalyserRef.current) {
        localAnalyserRef.current.getFloatTimeDomainData(localData);
        setLocalLevel(rms(localData));
      }

      // Remote levels
      const updates: Record<string, { level: number; muted: boolean }> = {};
      for (const [peerId, peer] of peersRef.current.entries()) {
        let level = 0;
        if (peer.analyser) {
          const data = new Float32Array(peer.analyser.fftSize);
          peer.analyser.getFloatTimeDomainData(data);
          level = rms(data);
        }
        peer.level = level;
        updates[peerId] = { level, muted: peer.muted };
      }
      if (Object.keys(updates).length > 0) {
        setPeerStates(updates);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Toggle mic
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
      // Persist mute state so page refresh keeps it
      localStorage.setItem("voice-muted", String(!audioTrack.enabled));
      const s = socketRef.current;
      const rc = roomCodeRef.current;
      if (s && rc) {
        s.emit("group-voice-mute", { roomCode: rc, muted: !audioTrack.enabled });
      }
    }
  }, []);

  // Socket signaling listeners
  useEffect(() => {
    if (!socket) return;

    // When a new peer joins voice, create a connection to them (we are the initiator)
    // Also send them our current mute state so they see the correct status immediately
    function onGroupVoiceJoin({ peerId }: { peerId: string }) {
      if (!localStreamRef.current) return;
      createPeer(peerId, localStreamRef.current, true);
      const s = socketRef.current;
      if (s) {
        s.emit("group-voice-mute-to", { to: peerId, muted: !micOnRef.current });
      }
    }

    // When we receive an offer from a peer
    async function onGroupVoiceOffer({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) {
      if (!localStreamRef.current) {
        // We haven't joined yet, try to join first
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          setMicOn(true);
          setInCall(true);
        } catch {
          return;
        }
      }

      let peer = peersRef.current.get(from);
      if (!peer) {
        createPeer(from, localStreamRef.current!, false);
        peer = peersRef.current.get(from);
      }
      if (!peer) return;

      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        socketRef.current?.emit("group-voice-answer", { to: from, answer: peer.pc.localDescription });
      } catch (err) {
        console.error("[group-voice] answer error", err);
      }
    }

    // When we receive an answer
    async function onGroupVoiceAnswer({ answer, from }: { answer: RTCSessionDescriptionInit; from: string }) {
      const peer = peersRef.current.get(from);
      if (!peer) return;
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error("[group-voice] set answer error", err);
      }
    }

    // ICE candidates
    async function onGroupVoiceIce({ candidate, from }: { candidate: RTCIceCandidateInit; from: string }) {
      const peer = peersRef.current.get(from);
      if (!peer) return;
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[group-voice] ice error", err);
      }
    }

    // Mute status from a peer
    function onGroupVoiceMute({ peerId, muted }: { peerId: string; muted: boolean }) {
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.muted = muted;
      }
      // Always update peerStates — the mute-to message can arrive before WebRTC is fully connected
      setPeerStates((prev) => ({
        ...prev,
        [peerId]: { level: prev[peerId]?.level ?? 0, muted },
      }));
    }

    // When a user disconnects, remove their peer
    function onUserLeft({ id }: { id: string }) {
      removePeer(id);
    }

    socket.on("group-voice-join", onGroupVoiceJoin);
    socket.on("group-voice-offer", onGroupVoiceOffer);
    socket.on("group-voice-answer", onGroupVoiceAnswer);
    socket.on("group-voice-ice", onGroupVoiceIce);
    socket.on("group-voice-mute", onGroupVoiceMute);
    socket.on("user-left", onUserLeft);

    return () => {
      socket.off("group-voice-join", onGroupVoiceJoin);
      socket.off("group-voice-offer", onGroupVoiceOffer);
      socket.off("group-voice-answer", onGroupVoiceAnswer);
      socket.off("group-voice-ice", onGroupVoiceIce);
      socket.off("group-voice-mute", onGroupVoiceMute);
      socket.off("user-left", onUserLeft);
    };
  }, [socket, createPeer, removePeer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localAudioCtxRef.current?.close();
      for (const [, peer] of peersRef.current.entries()) {
        peer.pc.close();
        peer.audioEl.srcObject = null;
        peer.audioCtx?.close();
      }
      peersRef.current.clear();
    };
  }, []);

  return { micOn, inCall, localLevel, peerStates, toggleMic };
}
