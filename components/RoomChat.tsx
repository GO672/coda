"use client";

import * as React from "react";
import type { Socket } from "socket.io-client";

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  timestamp: number;
  file?: {
    data: string; // base64 encoded file data
    name: string;
    type: string;
    size: number;
  };
}

interface RoomChatProps {
  socket: Socket | null;
  roomCode: string;
  userName: string;
}

export function RoomChat({ socket, roomCode, userName }: RoomChatProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [showToast, setShowToast] = React.useState(false);
  const [lastMessage, setLastMessage] = React.useState<ChatMessage | null>(null);
  const [lastReadTimestamp, setLastReadTimestamp] = React.useState<number>(0);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [emojiSearch, setEmojiSearch] = React.useState("");
  const [emojiCategory, setEmojiCategory] = React.useState("smileys");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const chatPanelRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load lastReadTimestamp from localStorage when roomCode changes
  React.useEffect(() => {
    const storageKey = `chat-lastread-${roomCode}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      setLastReadTimestamp(parseInt(stored, 10));
    } else {
      // First visit - set to 0 so all messages from others show as unread
      setLastReadTimestamp(0);
    }
  }, [roomCode]);

  // Calculate unread count based on messages after last read timestamp
  React.useEffect(() => {
    if (isOpen || messages.length === 0) return;
    const unread = messages.filter(
      (msg) => msg.timestamp > lastReadTimestamp && msg.senderName !== userName
    ).length;
    setUnreadCount(unread);
  }, [messages, lastReadTimestamp, isOpen, userName]);

  // Click outside to close chat panel
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (chatPanelRef.current && !chatPanelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Click outside to close emoji picker
  React.useEffect(() => {
    if (!showEmojiPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't close if clicking the emoji button itself
      if (target.closest('button[title="Add emoji"]')) return;
      // Close if clicking outside the emoji picker
      if (!target.closest('.absolute.bottom-full')) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showEmojiPicker]);

  React.useEffect(() => {
    if (!socket) return;

    const onChatHistory = (history: ChatMessage[]) => {
      setMessages(history);
    };

    const onChatMessage = (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
      
      // If chat is closed and message is from someone else, show toast
      if (!isOpen && message.senderName !== userName) {
        setLastMessage(message);
        setShowToast(true);
        
        // Auto-hide toast after 5 seconds
        setTimeout(() => {
          setShowToast(false);
        }, 5000);
      }
    };

    socket.on("chat-history", onChatHistory);
    socket.on("chat-message", onChatMessage);

    return () => {
      socket.off("chat-history", onChatHistory);
      socket.off("chat-message", onChatMessage);
    };
  }, [socket, isOpen, userName]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Limit file size to 5MB
      if (file.size > 5 * 1024 * 1024) {
        alert("File size must be less than 5MB");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!socket || !selectedFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      
      socket.emit("chat-message", {
        roomCode,
        message: selectedFile.name,
        file: {
          data: base64Data,
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
        },
      });
      
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleEmojiSelect = (emoji: string) => {
    setInputValue((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleSend = () => {
    if (!socket) return;
    
    if (selectedFile) {
      handleFileUpload();
    } else if (inputValue.trim()) {
      socket.emit("chat-message", {
        roomCode,
        message: inputValue.trim(),
      });
      
      setInputValue("");
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleChat = () => {
    const wasOpen = isOpen;
    setIsOpen((prev) => !prev);
    if (!wasOpen) {
      // Opening chat - mark all current messages as read
      const now = Date.now();
      setLastReadTimestamp(now);
      setUnreadCount(0);
      localStorage.setItem(`chat-lastread-${roomCode}`, now.toString());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {/* Toast notification for new messages */}
      {showToast && lastMessage && (
        <div className="fixed bottom-24 right-6 z-50 max-w-xs animate-in slide-in-from-bottom-5">
          <div className="rounded-xl bg-gradient-to-r from-violet-500/90 to-sky-500/90 p-3 shadow-lg shadow-black/40 backdrop-blur-md ring-1 ring-white/20">
            <div className="flex items-start gap-2">
              <svg className="h-5 w-5 shrink-0 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white">{lastMessage.senderName}</div>
                <div className="mt-0.5 text-xs text-white/90 line-clamp-2">{lastMessage.text}</div>
              </div>
              <button
                onClick={() => setShowToast(false)}
                className="shrink-0 text-white/70 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div ref={chatPanelRef} className="fixed bottom-24 right-6 z-50 flex h-[500px] w-[380px] flex-col rounded-2xl bg-black/80 shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
              <span className="text-sm font-semibold text-white">Room Chat</span>
            </div>
            <button
              onClick={toggleChat}
              className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center">
                <div className="text-sm text-white/40">
                  No messages yet.<br />Start the conversation!
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderName === userName;
                const isInstructor = msg.senderRole === "instructor";
                const hasFile = msg.file && msg.file.data;
                const isImage = hasFile && (msg.file?.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(msg.file?.name || ""));
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
                      <div className="flex items-center gap-1.5 px-1">
                        <span className={`text-[10px] font-semibold ${isInstructor ? "text-amber-300" : "text-sky-300"}`}>
                          {msg.senderName}
                        </span>
                        <span className="text-[9px] text-white/40">{formatTime(msg.timestamp)}</span>
                      </div>
                      <div
                        className={`rounded-2xl px-3 py-2 ${
                          isMe
                            ? "bg-gradient-to-r from-violet-500/30 to-sky-500/30 ring-1 ring-violet-400/30"
                            : "bg-white/5 ring-1 ring-white/10"
                        }`}
                      >
                        {hasFile ? (
                          <div className="space-y-2">
                            {isImage ? (
                              <img
                                src={msg.file!.data}
                                alt={msg.file!.name}
                                className="max-w-full rounded-lg"
                                style={{ maxHeight: "200px" }}
                              />
                            ) : (
                              <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
                                <svg className="h-6 w-6 text-white/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-white truncate">{msg.file!.name}</div>
                                  <div className="text-[10px] text-white/60">{(msg.file!.size / 1024).toFixed(1)} KB</div>
                                </div>
                              </div>
                            )}
                            <a
                              href={msg.file!.data}
                              download={msg.file!.name}
                              className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                              </svg>
                              Download
                            </a>
                          </div>
                        ) : (
                          <p className="text-sm text-white break-words">{msg.text}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="relative border-t border-white/10 p-3">
            {/* Selected file preview */}
            {selectedFile && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 p-2">
                <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{selectedFile.name}</div>
                  <div className="text-[10px] text-white/60">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="shrink-0 text-white/60 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            
            {/* Emoji Picker - WhatsApp style */}
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl bg-[#1a1a2e] shadow-2xl ring-1 ring-white/10 z-10 flex flex-col" style={{ height: "320px" }}>
                {/* Category tabs */}
                <div className="flex items-center border-b border-white/10 px-1">
                  {[
                    { id: "smileys", icon: "😊" },
                    { id: "people", icon: "👋" },
                    { id: "animals", icon: "🐶" },
                    { id: "food", icon: "🍔" },
                    { id: "activities", icon: "⚽" },
                    { id: "travel", icon: "🚗" },
                    { id: "objects", icon: "💡" },
                    { id: "symbols", icon: "❤️" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => { setEmojiCategory(cat.id); setEmojiSearch(""); }}
                      className={`flex-1 py-2 text-lg text-center transition-colors ${emojiCategory === cat.id ? "border-b-2 border-violet-400 bg-white/5" : "hover:bg-white/5"}`}
                    >
                      {cat.icon}
                    </button>
                  ))}
                </div>

                {/* Search bar */}
                <div className="px-3 py-2">
                  <input
                    type="text"
                    value={emojiSearch}
                    onChange={(e) => setEmojiSearch(e.target.value)}
                    placeholder="Search emoji..."
                    className="w-full rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
                  />
                </div>

                {/* Emoji grid */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 hide-scrollbar">
                  {(() => {
                    const categories: Record<string, { label: string; emojis: string[] }> = {
                      smileys: { label: "Smileys & Emotion", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"] },
                      people: { label: "People & Body", emojis: ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","💋","👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷","💃","🕺","👯","🧘","🧖","🧗","🤸","🏃","🚶","🧍","🧎"] },
                      animals: { label: "Animals & Nature", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐈","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔","🌵","🎄","🌲","🌳","🌴","🪵","🌱","🌿","☘️","🍀","🎍","🪴","🎋","🍃","🍂","🍁","🪺","🪹","🍄","🌾","💐","🌷","🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌎","🌍","🌏","🪐","💫","⭐","🌟","✨","⚡","☄️","💥","🔥","🌪️","🌈","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌬️","💨","💧","💦","🌊"] },
                      food: { label: "Food & Drink", emojis: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🦴","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🥛","🍼","🫖","☕","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾","🧊","🥄","🍴","🍽️","🥣","🥡","🥢"] },
                      activities: { label: "Activities", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️","🤼","🤸","🤺","⛹️","🤾","🏌️","🏇","🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🎪","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🪗","🎸","🪕","🎻","🎲","♟️","🎯","🎳","🎮","🕹️","🧩","🎰","🎗️","🎟️","🎫","🎖️","🏆","🏅","🥇","🥈","🥉","🎃","🎄","🎆","🎇","🧨","✨","🎈","🎉","🎊","🎋","🎍","🎎","🎏","🎐","🎑","🧧","🎀","🎁","🎗️"] },
                      travel: { label: "Travel & Places", emojis: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🦯","🦽","🦼","🛴","🚲","🛵","🏍️","🛺","🚍","🚔","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","⚓","⛽","🚧","🚦","🚥","🗺️","🗿","🗽","🗼","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","⛱️","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺","🏠","🏡","🏗️","🏭","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","💒","🏛️","⛪","🕌","🕍","🛕","🕋"] },
                      objects: { label: "Objects", emojis: ["⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️","💽","💾","💿","📀","📼","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🔌","💡","🔦","🕯️","🪔","🧯","🛢️","💸","💵","💴","💶","💷","🪙","💰","💳","💎","⚖️","🪜","🧰","🪛","🔧","🔨","⚒️","🛠️","⛏️","🪚","🔩","⚙️","🪤","🧱","⛓️","🧲","🔫","💣","🧨","🪓","🔪","🗡️","⚔️","🛡️","🚬","⚰️","🪦","⚱️","🏺","🔮","📿","🧿","💈","⚗️","🔭","🔬","🕳️","🩹","🩺","💊","💉","🩸","🧬","🦠","🧫","🧪","🌡️","🧹","🪠","🧺","🧻","🚽","🚰","🚿","🛁","🛀","🧼","🪥","🪒","🧽","🪣","🧴","🛎️","🔑","🗝️","🚪","🪑","🛋️","🛏️","🛌","🧸","🪆","🖼️","🪞","🪟","🛍️","🛒","🎁","🎈","🎏","🎀","🪄","🪅","🎊","🎉","🎎","🏮","🎐","🧧","✉️","📩","📨","📧","💌","📥","📤","📦","🏷️","🪧","📪","📫","📬","📭","📮","📯","📜","📃","📄","📑","🧾","📊","📈","📉","🗒️","🗓️","📆","📅","🗑️","📇","🗃️","🗳️","🗄️","📋","📁","📂","🗂️","🗞️","📰","📓","📔","📒","📕","📗","📘","📙","📚","📖","🔖","🧷","🔗","📎","🖇️","📐","📏","🧮","📌","📍","✂️","🖊️","🖋️","✒️","🖌️","🖍️","📝","✏️","🔍","🔎","🔏","🔐","🔒","🔓"] },
                      symbols: { label: "Symbols", emojis: ["❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❇️","✳️","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🛗","🈳","🈂️","🛂","🛃","🛄","🛅","🚹","🚺","🚼","⚧️","🚻","🚮","🎦","📶","🈁","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔢","#️⃣","*️⃣","⏏️","▶️","⏸️","⏯️","⏹️","⏺️","⏭️","⏮️","⏩","⏪","⏫","⏬","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","↪️","↩️","⤴️","⤵️","🔀","🔁","🔂","🔄","🔃","🎵","🎶","➕","➖","➗","✖️","♾️","💲","💱","™️","©️","®️","〰️","➰","➿","🔚","🔙","🔛","🔝","🔜","✔️","☑️","🔘","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","🔸","🔹","🔶","🔷","🔳","🔲","▪️","▫️","◾","◽","◼️","◻️","🟥","🟧","🟨","🟩","🟦","🟪","⬛","⬜","🟫","🔈","🔇","🔉","🔊","🔔","🔕","📣","📢","👁️‍🗨️","💬","💭","🗯️","♠️","♣️","♥️","♦️","🃏","🎴","🀄","🕐","🕑","🕒","🕓","🕔","🕕","🕖","🕗","🕘","🕙","🕚","🕛"] },
                    };

                    const currentCategory = categories[emojiCategory];
                    const filteredEmojis = emojiSearch
                      ? Object.values(categories).flatMap(c => c.emojis)
                      : currentCategory.emojis;

                    const displayEmojis = emojiSearch
                      ? filteredEmojis
                      : filteredEmojis;

                    return (
                      <>
                        <div className="px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                          {emojiSearch ? "Search Results" : currentCategory.label}
                        </div>
                        <div className="grid grid-cols-8 gap-0.5">
                          {displayEmojis.map((emoji, index) => (
                            <button
                              key={`emoji-${index}`}
                              onClick={() => handleEmojiSelect(emoji)}
                              className="flex items-center justify-center text-2xl h-10 w-full rounded-lg hover:bg-white/10 transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            
            <div className="flex items-end gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt,.zip"
              />
              
              {/* Emoji button */}
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="shrink-0 rounded-xl bg-white/5 p-2 text-white/60 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
                title="Add emoji"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
                </svg>
              </button>
              
              {/* File upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 rounded-xl bg-white/5 p-2 text-white/60 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
                title="Attach file"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
              </button>
              
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={!!selectedFile}
                className="flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-violet-400/50 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() && !selectedFile}
                className="shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-sky-500 p-2 text-white shadow-md shadow-violet-950/40 ring-1 ring-white/10 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle button (bottom-right corner) */}
      <button
        onClick={toggleChat}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-sky-500 text-white shadow-lg shadow-violet-950/40 ring-1 ring-white/20 hover:opacity-90 transition-opacity"
      >
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-black">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      </button>
    </>
  );
}
