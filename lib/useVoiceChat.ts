"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useVoiceChat(socket: Socket | null, roomCode: string) {
  const [micOn, setMicOn] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [localLevel, setLocalLevel] = useState(0);
  const [remoteLevel, setRemoteLevel] = useState(0);
  const [peerMuted, setPeerMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const makingOfferRef = useRef(false);
  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const remoteAudioCtxRef = useRef<AudioContext | null>(null);
  const levelRafRef = useRef<number>(0);
  const autoJoinedRef = useRef(false);
  const socketRef = useRef(socket);
  const roomCodeRef = useRef(roomCode);
  socketRef.current = socket;
  roomCodeRef.current = roomCode;

  // Create or get the hidden <audio> element for remote playback
  useEffect(() => {
    if (typeof window === "undefined") return;
    let el = document.getElementById("__voice-remote-audio") as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement("audio");
      el.id = "__voice-remote-audio";
      el.autoplay = true;
      el.style.display = "none";
      document.body.appendChild(el);
    }
    remoteAudioRef.current = el;
  }, []);

  const stopLevelMonitoring = useCallback(() => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = 0;
    }
    if (localAudioCtxRef.current) {
      localAudioCtxRef.current.close().catch(() => {});
      localAudioCtxRef.current = null;
    }
    if (remoteAudioCtxRef.current) {
      remoteAudioCtxRef.current.close().catch(() => {});
      remoteAudioCtxRef.current = null;
    }
    setLocalLevel(0);
    setRemoteLevel(0);
  }, []);

  const startLevelMonitoring = useCallback((localStream: MediaStream) => {
    stopLevelMonitoring();
    try {
      const localCtx = new AudioContext();
      localAudioCtxRef.current = localCtx;
      const localSource = localCtx.createMediaStreamSource(localStream);
      const localAnalyser = localCtx.createAnalyser();
      localAnalyser.fftSize = 2048;
      localAnalyser.smoothingTimeConstant = 0.3;
      localSource.connect(localAnalyser);

      const localData = new Float32Array(localAnalyser.fftSize);

      let remoteAnalyser: AnalyserNode | null = null;
      let remoteData: Float32Array | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function rms(data: any): number {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        return Math.sqrt(sum / data.length);
      }

      function tick() {
        // Local level (RMS of waveform)
        localAnalyser.getFloatTimeDomainData(localData);
        const localRms = rms(localData);
        setLocalLevel(localRms);

        // Remote level
        if (!remoteAnalyser && remoteAudioRef.current?.srcObject) {
          try {
            const remoteCtx = new AudioContext();
            remoteAudioCtxRef.current = remoteCtx;
            const remoteSource = remoteCtx.createMediaStreamSource(remoteAudioRef.current.srcObject as MediaStream);
            remoteAnalyser = remoteCtx.createAnalyser();
            remoteAnalyser.fftSize = 2048;
            remoteAnalyser.smoothingTimeConstant = 0.3;
            remoteSource.connect(remoteAnalyser);
            remoteData = new Float32Array(remoteAnalyser.fftSize);
          } catch (_) { /* ignore */ }
        }
        if (remoteAnalyser && remoteData) {
          remoteAnalyser.getFloatTimeDomainData(remoteData);
          const remoteRms = rms(remoteData);
          setRemoteLevel(remoteRms);
        }

        levelRafRef.current = requestAnimationFrame(tick);
      }
      levelRafRef.current = requestAnimationFrame(tick);
    } catch (_) { /* Web Audio not supported */ }
  }, [stopLevelMonitoring]);

  const cleanup = useCallback(() => {
    stopLevelMonitoring();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setMicOn(false);
    setInCall(false);
    setPeerConnected(false);
    makingOfferRef.current = false;
  }, [stopLevelMonitoring]);

  const createPC = useCallback(() => {
    if (!socket || !roomCode) return null;
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("voice-ice-candidate", { roomCode, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      if (remoteAudioRef.current && e.streams[0]) {
        remoteAudioRef.current.srcObject = e.streams[0];
      }
      setPeerConnected(true);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        setPeerConnected(false);
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        socket.emit("voice-offer", { roomCode, offer: pc.localDescription });
      } catch (err) {
        console.error("[voice] negotiation error", err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    pcRef.current = pc;
    return pc;
  }, [socket, roomCode]);

  // Join voice
  const joinVoice = useCallback(async () => {
    if (!socket || !roomCode) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // Restore mute state from localStorage so refresh keeps the same mute
      const wasMuted = localStorage.getItem("voice-muted") === "true";
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && wasMuted) {
        audioTrack.enabled = false;
      }
      setMicOn(!wasMuted);
      setInCall(true);

      const pc = createPC();
      if (!pc) return;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      startLevelMonitoring(stream);

      // Broadcast our mute state so the peer immediately sees the correct status
      if (wasMuted) {
        socket.emit("voice-mute-status", { roomCode, muted: true });
      }
    } catch (err) {
      console.error("[voice] Failed to get microphone", err);
      alert("Could not access microphone. Please allow microphone permission.");
    }
  }, [socket, roomCode, createPC, startLevelMonitoring]);

  // Auto-join voice when socket is ready
  useEffect(() => {
    if (!socket || !roomCode || autoJoinedRef.current || inCall) return;
    autoJoinedRef.current = true;
    joinVoice();
  }, [socket, roomCode, inCall, joinVoice]);

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
        s.emit("voice-mute-status", { roomCode: rc, muted: !audioTrack.enabled });
      }
    }
  }, []);

  // Socket signaling listeners
  useEffect(() => {
    if (!socket) return;

    async function onVoiceOffer({ offer }: { offer: RTCSessionDescriptionInit; from: string }) {
      // If we're not in a call yet, auto-join when we receive an offer
      let pc = pcRef.current;
      if (!pc) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          setMicOn(true);
          setInCall(true);
          pc = createPC();
          if (!pc) return;
          stream.getTracks().forEach((track) => {
            pc!.addTrack(track, stream);
          });
          startLevelMonitoring(stream);
        } catch (err) {
          console.error("[voice] Failed to get microphone on incoming offer", err);
          return;
        }
      }

      try {
        const offerCollision = makingOfferRef.current || pc.signalingState !== "stable";
        if (offerCollision) {
          // Polite peer: rollback and accept the offer
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" }),
            pc.setRemoteDescription(new RTCSessionDescription(offer)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket!.emit("voice-answer", { roomCode, answer: pc.localDescription });
      } catch (err) {
        console.error("[voice] Error handling offer", err);
      }
    }

    async function onVoiceAnswer({ answer }: { answer: RTCSessionDescriptionInit; from: string }) {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error("[voice] Error handling answer", err);
      }
    }

    async function onVoiceIceCandidate({ candidate }: { candidate: RTCIceCandidateInit; from: string }) {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[voice] Error adding ICE candidate", err);
      }
    }

    function onVoiceMuteStatus({ muted }: { muted: boolean; from: string }) {
      setPeerMuted(muted);
    }

    socket.on("voice-offer", onVoiceOffer);
    socket.on("voice-answer", onVoiceAnswer);
    socket.on("voice-ice-candidate", onVoiceIceCandidate);
    socket.on("voice-mute-status", onVoiceMuteStatus);

    return () => {
      socket.off("voice-offer", onVoiceOffer);
      socket.off("voice-answer", onVoiceAnswer);
      socket.off("voice-ice-candidate", onVoiceIceCandidate);
      socket.off("voice-mute-status", onVoiceMuteStatus);
    };
  }, [socket, roomCode, createPC, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { micOn, inCall, peerConnected, localLevel, remoteLevel, peerMuted, toggleMic };
}
