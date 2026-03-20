import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import * as path from "path";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 관리자 인증
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  // 요청 바디 파싱
  let body: { type?: string; pages?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type ?? "all";
  const pages = typeof body.pages === "number" ? body.pages : 5;

  if (!["announcement", "bid-result", "all"].includes(type)) {
    return NextResponse.json(
      { ok: false, message: "type은 announcement | bid-result | all 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  // 크롤러 백그라운드 spawn
  const crawlerIndex = path.resolve(process.cwd(), "../../apps/crawler/src/index.ts");

  const child = spawn(
    "npx",
    ["ts-node", crawlerIndex, "--type", type, "--pages", String(pages)],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    }
  );
  child.unref();

  console.error(`[crawl-trigger] type=${type} pages=${pages} pid=${child.pid}`);

  return NextResponse.json({
    ok: true,
    message: `크롤링 시작됨 (type=${type}, pages=${pages})`,
    pid: child.pid,
  });
}
