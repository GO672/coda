import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Piston language name -> version mapping
const LANGUAGE_VERSIONS: Record<string, { language: string; version: string }> = {
  javascript: { language: "javascript", version: "18.15.0" },
  python: { language: "python", version: "3.10.0" },
  java: { language: "java", version: "15.0.2" },
  c: { language: "c", version: "10.2.0" },
  cpp: { language: "c++", version: "10.2.0" },
  "c++": { language: "c++", version: "10.2.0" },
  csharp: { language: "csharp.net", version: "5.0.201" },
  "c#": { language: "csharp.net", version: "5.0.201" },
  typescript: { language: "typescript", version: "5.0.3" },
  ruby: { language: "ruby", version: "3.0.1" },
  go: { language: "go", version: "1.16.2" },
  rust: { language: "rust", version: "1.68.2" },
  php: { language: "php", version: "8.2.3" },
  swift: { language: "swift", version: "5.3.3" },
  kotlin: { language: "kotlin", version: "1.8.20" },
};

export async function POST(req: Request) {
  try {
    const token = (await cookies()).get("lch_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifyAuthToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body?.code || !body?.language) {
      return NextResponse.json({ error: "Missing code or language" }, { status: 400 });
    }

    const langKey = String(body.language).trim().toLowerCase();
    const langConfig = LANGUAGE_VERSIONS[langKey];
    if (!langConfig) {
      return NextResponse.json({ error: `Unsupported language: ${langKey}` }, { status: 400 });
    }

    const pistonRes = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ content: String(body.code) }],
        stdin: body.stdin || "",
      }),
    });

    if (!pistonRes.ok) {
      const text = await pistonRes.text().catch(() => "");
      return NextResponse.json({ error: `Execution failed: ${text}` }, { status: 502 });
    }

    const result = await pistonRes.json();
    const run = result.run || {};

    return NextResponse.json({
      ok: true,
      output: run.stdout || "",
      stderr: run.stderr || "",
      exitCode: run.code ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
