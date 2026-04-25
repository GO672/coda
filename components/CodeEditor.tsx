"use client";

import React from "react";
import Editor, { type OnMount } from "@monaco-editor/react";

const LANG_MAP: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "csharp",
  ruby: "ruby",
  go: "go",
  rust: "rust",
  php: "php",
  swift: "swift",
  kotlin: "kotlin",
};

type ExternalCursor = {
  selStart: number;
  selEnd: number;
  name?: string;
};

type Props = {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string;
  onCursorChange?: (sel: { selStart: number; selEnd: number }) => void;
  externalCursor?: ExternalCursor | null;
};

let cssInjected = false;
function injectCursorCSS() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .remote-cursor-line {
      border-left: 2px solid #3b82f6 !important;
      margin-left: -1px;
    }
    .remote-cursor-line-after {
      border-left: 2px solid #3b82f6 !important;
      margin-left: -1px;
    }
    .remote-cursor-widget {
      background: #3b82f6;
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
      position: absolute;
      top: -18px;
      pointer-events: none;
      z-index: 100;
    }
    .remote-selection {
      background: rgba(59, 130, 246, 0.3) !important;
    }
  `;
  document.head.appendChild(style);
}

export default function CodeEditor({
  value,
  onChange,
  language = "javascript",
  readOnly = false,
  height = "350px",
  onCursorChange,
  externalCursor,
}: Props) {
  const editorRef = React.useRef<any>(null);
  const decorationsRef = React.useRef<any>(null);
  const widgetRef = React.useRef<any>(null);
  const widgetDomRef = React.useRef<HTMLDivElement | null>(null);
  const widgetPosRef = React.useRef<{ lineNumber: number; column: number }>({ lineNumber: 1, column: 1 });
  const onCursorChangeRef = React.useRef(onCursorChange);
  const isApplyingRemoteRef = React.useRef(false);
  onCursorChangeRef.current = onCursorChange;

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    injectCursorCSS();

    editor.onDidChangeCursorSelection(() => {
      const cb = onCursorChangeRef.current;
      if (!cb) return;
      const model = editor.getModel();
      if (!model) return;
      const sel = editor.getSelection();
      if (!sel) return;
      // anchor = where user started dragging, cursor = where user ended
      const anchor = model.getOffsetAt({ lineNumber: sel.selectionStartLineNumber, column: sel.selectionStartColumn });
      const cursor = model.getOffsetAt(sel.getPosition());
      cb({ selStart: anchor, selEnd: cursor });
    });
  };

  // Update external cursor decorations + content widget when externalCursor changes
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    if (!externalCursor) {
      if (decorationsRef.current) {
        decorationsRef.current.clear();
        decorationsRef.current = null;
      }
      if (widgetRef.current) {
        try { editor.removeContentWidget(widgetRef.current); } catch {}
        widgetRef.current = null;
      }
      if (widgetDomRef.current) {
        widgetDomRef.current.style.display = "none";
      }
      return;
    }

    const { selStart, selEnd, name } = externalCursor;
    const cursorPos = model.getPositionAt(selEnd);
    const newDecorations: any[] = [];

    // Cursor line: use beforeContentClassName on a 1-char range
    const lineContent = model.getLineContent(cursorPos.lineNumber);
    const atEnd = cursorPos.column > lineContent.length;

    if (atEnd) {
      newDecorations.push({
        range: {
          startLineNumber: cursorPos.lineNumber,
          startColumn: Math.max(1, cursorPos.column - 1),
          endLineNumber: cursorPos.lineNumber,
          endColumn: cursorPos.column,
        },
        options: {
          afterContentClassName: "remote-cursor-line-after",
          stickiness: 1,
        },
      });
    } else {
      newDecorations.push({
        range: {
          startLineNumber: cursorPos.lineNumber,
          startColumn: cursorPos.column,
          endLineNumber: cursorPos.lineNumber,
          endColumn: cursorPos.column + 1,
        },
        options: {
          beforeContentClassName: "remote-cursor-line",
          stickiness: 1,
        },
      });
    }

    // Selection highlight
    if (selStart !== selEnd) {
      const startPos = model.getPositionAt(Math.min(selStart, selEnd));
      const endPos = model.getPositionAt(Math.max(selStart, selEnd));
      newDecorations.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        options: {
          className: "remote-selection",
          stickiness: 1,
        },
      });
    }

    if (decorationsRef.current) {
      decorationsRef.current.clear();
    }
    decorationsRef.current = editor.createDecorationsCollection(newDecorations);

    // Name label widget above cursor
    if (name) {
      widgetPosRef.current = { lineNumber: cursorPos.lineNumber, column: cursorPos.column };

      if (!widgetDomRef.current) {
        widgetDomRef.current = document.createElement("div");
        widgetDomRef.current.className = "remote-cursor-widget";
      }
      widgetDomRef.current.textContent = name;
      widgetDomRef.current.style.display = "";

      if (!widgetRef.current) {
        const domNode = widgetDomRef.current;
        const widget = {
          getId: () => "remote-cursor-widget-1",
          getDomNode: () => domNode,
          getPosition: () => ({
            position: widgetPosRef.current,
            preference: [1],
          }),
        };
        widgetRef.current = widget;
        editor.addContentWidget(widget);
      } else {
        editor.layoutContentWidget(widgetRef.current);
      }
    }
  }, [externalCursor]);

  // Handle value changes while preserving cursor position
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const currentValue = model.getValue();
    if (currentValue === value) return;

    if (readOnly) {
      // readOnly editors: executeEdits silently fails, use setValue directly
      model.setValue(value);
      return;
    }

    // Editable editors: preserve cursor and scroll during remote apply
    const position = editor.getPosition();
    const scrollTop = editor.getScrollTop();

    isApplyingRemoteRef.current = true;
    editor.executeEdits("remote", [
      {
        range: model.getFullModelRange(),
        text: value,
      },
    ]);
    isApplyingRemoteRef.current = false;

    if (position) {
      const lineCount = model.getLineCount();
      const restoredLine = Math.min(position.lineNumber, lineCount);
      const lineLength = model.getLineMaxColumn(restoredLine);
      const restoredColumn = Math.min(position.column, lineLength);
      editor.setPosition({ lineNumber: restoredLine, column: restoredColumn });
      editor.setScrollTop(scrollTop);
    }
  }, [value, readOnly]);

  return (
    <Editor
      height={height}
      language={LANG_MAP[language] || "plaintext"}
      defaultValue={value}
      onChange={(v) => { if (!isApplyingRemoteRef.current) onChange?.(v ?? ""); }}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        parameterHints: { enabled: true },
        autoClosingBrackets: "always",
        autoClosingQuotes: "always",
        formatOnPaste: true,
        formatOnType: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: readOnly ? "none" : "all",
        cursorStyle: readOnly ? "underline-thin" : "line",
        domReadOnly: readOnly,
      }}
    />
  );
}
