"use client";

import React from "react";

type Props = {
  output: string;
  isRunning?: boolean;
  onInput?: (input: string) => void;
  onKill?: () => void;
  onClear?: () => void;
  /** If true, hides the input bar (e.g. for students who only watch) */
  readOnly?: boolean;
};

export default function Terminal({ output, isRunning, onInput, onKill, onClear, readOnly }: Props) {
  const termRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = React.useState("");

  React.useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [output]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onInput || !inputValue.length) return;
    onInput(inputValue);
    setInputValue("");
    // Refocus input after submit
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function colorLine(line: string, idx: number) {
    // Error lines
    if (
      line.startsWith("Error:") ||
      line.startsWith("Traceback") ||
      line.startsWith("SyntaxError") ||
      line.startsWith("NameError") ||
      line.startsWith("TypeError") ||
      line.startsWith("ValueError") ||
      line.startsWith("IndentationError") ||
      line.includes("error:") ||
      line.includes("Error:")
    ) {
      return <span key={idx} className="text-red-400">{line}</span>;
    }
    // User input echo lines
    if (line.startsWith(">>> ")) {
      return (
        <span key={idx}>
          <span className="text-emerald-400">{">>> "}</span>
          <span className="text-cyan-300">{line.slice(4)}</span>
        </span>
      );
    }
    return <span key={idx} className="text-gray-200">{line}</span>;
  }

  return (
    <div className="terminal-dark flex flex-col rounded-xl bg-[#1a1a2e] ring-1 ring-white/10 overflow-hidden shadow-lg">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#16213e] border-b border-white/10">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="ml-2 text-xs font-medium text-white/50">Console</span>
        <span className="ml-auto inline-flex items-center gap-2">
          {output && !isRunning && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/50 ring-1 ring-white/10 hover:bg-white/10 hover:text-white/70"
            >
              Clear
            </button>
          )}
          {isRunning && (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Running
              </span>
              {onKill && (
                <button
                  type="button"
                  onClick={onKill}
                  className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300 ring-1 ring-red-400/30 hover:bg-red-500/30"
                >
                  Stop
                </button>
              )}
            </>
          )}
        </span>
      </div>

      {/* Output area */}
      <div
        ref={termRef}
        className="min-h-[160px] max-h-[300px] overflow-auto p-4 font-mono text-sm leading-relaxed"
      >
        {output ? (
          output.split("\n").map((line, i) => (
            <div key={i} className="whitespace-pre-wrap min-h-[1.25em]">
              {colorLine(line, i)}
            </div>
          ))
        ) : (
          <span className="text-white/30 italic">
            {readOnly ? "Waiting for instructor to run the code…" : "Press Run to execute code"}
          </span>
        )}
      </div>

      {/* Input bar — visible while process is running (instructor only) */}
      {isRunning && !readOnly && onInput && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-white/10 bg-[#0f3460] px-4 py-2"
        >
          <span className="text-emerald-400 text-sm font-bold">{">"}</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 bg-transparent text-white outline-none font-mono text-sm caret-emerald-400 placeholder:text-white/30"
            placeholder="Type input and press Enter…"
            autoFocus
          />
          <button
            type="submit"
            className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
