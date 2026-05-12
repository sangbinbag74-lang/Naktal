import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { g2bFetchBidResultPage, g2bFetchOpengComptForBidNtceNo, g2bParseDate, toYMD } from "@/lib/g2b";

export const maxDuration = 300; // Vercel Pro 한도 5분 (Hobby 60초)
export const dynamic = "force-dynamic";

// 한 번의 호출에서 G2B 직접 조회는 최대 N건만 처리 (504 방지)
// 나머지는 다음 동기화에서 처리됨
const AI_G2B_BATCH_LIMIT = 5;

const SCSBID_OPS = [
  "getScsbidListSttusThng",
  "getScsbidListSttusCnstwk",
  "getScsbidListSttusServc",
  "getScsbidListSttusFrgcpt",
];

// G2B 직접 조회 — 1차: SCSBID inqryDiv=2, 2차: OpengCompt (단건 직접, 박상빈님이 본 진짜 작동 API)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFromG2B(konepsId: string, deadline: Date): Promise<any | null> {
  // 1차: SCSBID inqryDiv=2 (개찰일자 기준) — 마감 직후 결과 매칭
  const fromDate = toYMD(new Date(deadline.getTime() - 2 * 86400000)) + "0000";
  const toDate = toYMD(new Date(deadline.getTime() + 30 * 86400000)) + "2359";
  for (const op of SCSBID_OPS) {
    try {
      const { items } = await g2bFetchBidResultPage({
        pageNo: 1, numOfRows: 999, inqryBgnDt: fromDate, inqryEndDt: toDate,
        operation: op, inqryDiv: "2",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = items.find((i: any) => i.bidNtceNo?.trim() === konepsId);
      if (m) return m;
    } catch (e) {
      console.error(`[refresh-outcomes] SCSBID ${op} 호출 실패:`, (e as Error).message);
    }
  }
  // 2차: OpengCompt 단건 조회 (박상빈님 실측 = '어제 1시간 후 G2B 결과 나옴' 의 진짜 작동 API)
  try {
    const compt = await g2bFetchOpengComptForBidNtceNo({ bidNtceNo: konepsId, deadline });
    const winner = compt.find(c => String(c.opengRank ?? "").trim() === "1");
    if (winner) {
      return {
        bidNtceNo: konepsId,
        sucsfbidAmt: String(winner.bidprcAmt ?? "").replace(/[^0-9]/g, ""),
        sucsfbidRate: String(winner.bidprcrt ?? ""),
        sucsfbidCorpNm: winner.prcbdrNm ?? null,
        bidwinnrNm: winner.prcbdrNm ?? null,
        sucsfbidCorpBizno: winner.prcbdrBizno ?? null,
        prtcptCnum: String(compt.length),
        totPrtcptCo: String(compt.length),
        opengDt: winner.bidprcDt ?? null,
        _viaOpengCompt: true,
      };
    }
  } catch (e) {
    console.error(`[refresh-outcomes] OpengCompt 단건 호출 실패:`, (e as Error).message);
  }
  return null;
}

// OpengResult 직접 폴백 (수의계약 포함 — BidOpeningDetail 이 비어있는 신선 공고)
const OPENG_OPS = [
  "getOpengResultListInfoCnstwk",
  "getOpengResultListInfoServc",
  "getOpengResultListInfoThng",
  "getOpengResultListInfoFrgcpt",
];
const SCSBID_BASE_URL = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOpengFromG2B(konepsId: string, deadline: Date): Promise<any | null> {
  const fromDate = toYMD(new Date(deadline.getTime() - 3 * 86400000)) + "0000";
  const toDate = toYMD(new Date(deadline.getTime() + 7 * 86400000)) + "2359";
  for (const op of OPENG_OPS) {
    try {
      const url = `${SCSBID_BASE_URL}/${op}?serviceKey=${process.env.G2B_API_KEY ?? process.env.KONEPS_API_KEY}&type=json&inqryDiv=1&inqryBgnDt=${fromDate}&inqryEndDt=${toDate}&bidNtceNo=${konepsId}&bidNtceOrd=000&numOfRows=999&pageNo=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (data as any)?.response?.body;
      let items = body?.items ?? [];
      if (!Array.isArray(items)) items = items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = items.find((i: any) => i.bidNtceNo?.trim() === konepsId);
      if (m && m.opengCorpInfo) {
        // opengCorpInfo 파싱 → BidResult 호환 객체 반환
        const parts = String(m.opengCorpInfo).split("^");
        if (parts.length >= 5) {
          const price = parseInt((parts[3] || "").replace(/\D/g, ""), 10) || 0;
          const rate = parseFloat(parts[4] || "0") || 0;
          if (price > 0 && rate > 0) {
            return {
              annId: konepsId,
              bidRate: rate.toString(),
              finalPrice: String(price),
              numBidders: parseInt(String(m.prtcptCnum || "0").replace(/\D/g, ""), 10),
              winnerName: parts[0]?.trim() || null,
              openedAt: m.opengDt ? g2bParseDate(m.opengDt) : null,
            };
          }
        }
      }
    } catch (e) {
      console.error(`[refresh-outcomes] OpengResult ${op} 실패:`, (e as Error).message);
    }
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // 마감 + 1시간 지난 BidRequest 만 처리 (개찰 직후 결과 등록 지연 감안)
  const deadlineCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // 1. 마감 + 1시간 지났으나 결과 미입력 BidRequest 조회 (최대 50건)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pending, error: pendingErr } = await (admin.from("BidRequest") as any)
    .select("id,userId,konepsId,budget,recommendedBidPrice,predictedSajungRate,deadline")
    .lt("deadline", deadlineCutoff)
    .is("isWon", null)
    .limit(50);

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 });
  }
  // BidRequest pending 0 이어도 AIPrediction 채움은 계속 진행 (early return 제거)
  const pendingList = pending ?? [];

  // 2. konepsId 목록으로 BidResult + BidOpeningDetail 병렬 배치 조회
  // BidOpeningDetail: 수의계약 포함 모든 개찰결과 (getOpengResultListInfo*)
  // BidResult: 일반 입찰 결과 (getScsbidListSttus*) — 수의계약 누락
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const konepsIds = [...new Set(pendingList.map((r: any) => r.konepsId).filter(Boolean))];
  const [bidResultRes, openingRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("BidResult") as any)
      .select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt")
      .in("annId", konepsIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("BidOpeningDetail") as any)
      .select("annId,sucsfbidRate,bidCount,openingDate,rawJson")
      .in("annId", konepsIds),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultMap: Record<string, any> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bidResultRes.data ?? []).map((r: any) => [r.annId, r])
  );
  // BidOpeningDetail → BidResult 형식으로 변환 (opengCorpInfo 파싱)
  // 형식: "회사명^사업자번호^대표명^금액^낙찰률"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (openingRes.data ?? []) as any[]) {
    if (resultMap[o.annId]) continue; // BidResult 우선
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = (o.rawJson || []) as any[];
    if (!arr.length) continue;
    const first = arr[0];
    const info = String(first.opengCorpInfo || "");
    const parts = info.split("^");
    if (parts.length < 5) continue;
    const finalPrice = parts[3]?.replace(/[^0-9]/g, "") || "0";
    if (finalPrice === "0") continue;
    resultMap[o.annId] = {
      annId: o.annId,
      bidRate: (o.sucsfbidRate ?? parseFloat(parts[4] || "0") ?? 0).toString(),
      finalPrice,
      numBidders: parseInt((first.prtcptCnum || o.bidCount || "0").toString().replace(/[^0-9]/g, ""), 10),
      winnerName: parts[0]?.trim() || null,
      openedAt: o.openingDate ? new Date(o.openingDate).toISOString() : (first.opengDt ? g2bParseDate(first.opengDt) : null),
    };
  }

  // 3. userId 목록으로 User(회사명+사업자번호) 배치 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = [...new Set(pendingList.map((r: any) => r.userId).filter(Boolean))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (admin.from("User") as any)
    .select("id,bizName,bizNo")
    .in("id", userIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMap: Record<string, { bizName: string; bizNo: string }> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (users ?? []).map((u: any) => [u.id, { bizName: u.bizName ?? "", bizNo: String(u.bizNo ?? "").replace(/\D/g, "") }])
  );

  // 3-2. 사정율 계산의 정확한 기준 = Announcement.bsisAmt (기초금액, 부가세 포함)
  // BidRequest.budget 은 의뢰 시점 값으로 부정확할 수 있음. 항상 Announcement 직접 조회로 통일.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anns } = await (admin.from("Announcement") as any)
    .select("konepsId,bsisAmt,budget,aValueAmt")
    .in("konepsId", konepsIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annMap: Record<string, number> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (anns ?? []).map((a: any) => {
      // bsisAmt 우선, 없으면 aValueAmt, 없으면 budget × 1.1
      const bsis = Number(a.bsisAmt ?? 0);
      const avAmt = Number(a.aValueAmt ?? 0);
      const bud = Number(a.budget ?? 0);
      const base = bsis > 0 ? bsis : avAmt > 0 ? avAmt : Math.round(bud * 1.1);
      return [a.konepsId, base];
    })
  );

  // 4. 각 BidRequest 업데이트
  let updated = 0;
  let skipped = 0;
  let g2bFetched = 0;
  let bidReqG2bCalls = 0;
  const BID_REQ_G2B_LIMIT = 3; // BidRequest 처리부 G2B 직접 조회 1회 호출당 최대 3건 (504 방지)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const req of pendingList as any[]) {
    let res = resultMap[req.konepsId];
    // BidResult 없으면 G2B 직접 조회 — 배치 한도 내에서만
    if (!res && req.konepsId && req.deadline && bidReqG2bCalls < BID_REQ_G2B_LIMIT) {
      bidReqG2bCalls++;
      const found = await fetchFromG2B(req.konepsId, new Date(req.deadline));
      if (found) {
        const rateRaw = (found.sucsfbidRate || "").replace(/[^0-9.]/g, "");
        const priceRaw = (found.sucsfbidAmt || "").replace(/[^0-9]/g, "");
        if (rateRaw && priceRaw) {
          res = {
            annId: req.konepsId,
            bidRate: parseFloat(rateRaw).toFixed(3),
            finalPrice: String(parseInt(priceRaw, 10)),
            numBidders: parseInt((found.prtcptCnum || found.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
            winnerName: found.sucsfbidCorpNm?.trim() || found.bidwinnrNm?.trim() || null,
            openedAt: found.opengDt ? g2bParseDate(found.opengDt) : null,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin.from("BidResult") as any).upsert(res, { onConflict: "annId" });
          g2bFetched++;
        }
      }
      // SCSBID 실패 시 OpengResult — 같은 row 의 2차 시도 (카운터 증가 X)
      if (!res) {
        const opengFound = await fetchOpengFromG2B(req.konepsId, new Date(req.deadline));
        if (opengFound) {
          res = opengFound;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin.from("BidResult") as any).upsert(res, { onConflict: "annId" });
          g2bFetched++;
        }
      }
    }
    if (!res) { skipped++; continue; }

    const userInfo = userMap[req.userId] ?? { bizName: "", bizNo: "" };
    const bizName: string = userInfo.bizName;
    const userBizNo: string = userInfo.bizNo;
    const winnerName: string = res.winnerName ?? "";

    const isWon: boolean =
      bizName.length > 1 && winnerName.length > 1
        ? winnerName.includes(bizName) || bizName.includes(winnerName)
        : false;

    // 사용자 사업자번호로 OpengCompt 조회 → 순위·실투찰가·추첨번호 매칭
    let userRank: number | null = null;
    let userBidPriceFromG2B: number | null = null;
    let userBidRate: number | null = null;
    let userDrwtNo1: number | null = null;
    let userDrwtNo2: number | null = null;
    let userBidAtFromG2B: string | null = null;
    if (userBizNo.length === 10 && req.konepsId && req.deadline) {
      try {
        const comptItems = await g2bFetchOpengComptForBidNtceNo({
          bidNtceNo: req.konepsId,
          deadline: new Date(req.deadline),
        });
        // 사업자번호 정규화 강화 — 숫자만 추출 후 끝자리 10자 사용 (앞 0/지점코드 차이 흡수)
        const userBizNoLast10 = userBizNo.slice(-10);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizeBiz = (raw: any): string => {
          const s = String(raw ?? "").replace(/\D/g, "");
          return s.length >= 10 ? s.slice(-10) : s.padStart(10, "0");
        };
        // G2B 응답에서 사업자번호가 들어올 수 있는 후보 필드 (스키마 변동 대비)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getCandidateBiznos = (c: any): string[] => [
          c.prcbdrBizno, c.bizno, c.bizNo, c.prtcptCorpBizno,
          c.prcbdrCeoBizno, c.bidprrBizno,
        ].filter(Boolean).map(normalizeBiz);

        const me = comptItems.find(c => getCandidateBiznos(c).includes(userBizNoLast10));
        if (me) {
          userRank = parseInt(me.opengRank ?? "0", 10) || null;
          userBidPriceFromG2B = parseInt(String(me.bidprcAmt ?? "0").replace(/[^0-9]/g, ""), 10) || null;
          userBidRate = parseFloat(String(me.bidprcrt ?? "0")) || null;
          userDrwtNo1 = parseInt(String(me.drwtNo1 ?? "").trim(), 10) || null;
          userDrwtNo2 = parseInt(String(me.drwtNo2 ?? "").trim(), 10) || null;
          userBidAtFromG2B = me.bidprcDt ? g2bParseDate(me.bidprcDt) : null;
        }
      } catch (e) {
        console.error(`[refresh-outcomes] OpengCompt 조회 실패 ${req.konepsId}:`, (e as Error).message);
      }
    }

    // 사정율 = 예정가 / 기초금액 × 100. 기초금액은 Announcement.bsisAmt 우선
    const baseAmount = annMap[req.konepsId] ?? Number(req.budget ?? 0);
    const finalPrice = Number(res.finalPrice ?? 0);
    const bidRate = Number(res.bidRate ?? 0);
    const actualSajungRate =
      baseAmount > 0 && bidRate > 0
        ? (finalPrice / (bidRate / 100) / baseAmount) * 100
        : null;

    const predictedSajung = Number(req.predictedSajungRate ?? 0);
    const deviationPct =
      actualSajungRate != null && predictedSajung > 0
        ? Math.abs(predictedSajung - actualSajungRate)
        : null;
    const isHit = deviationPct != null ? deviationPct <= 0.5 : null;

    const recPrice = Number(req.recommendedBidPrice ?? 0);
    const feeRate = recPrice > 0 && recPrice < 100_000_000 ? 0.017 : 0.015;
    const feeAmount = isWon ? Math.round(finalPrice * feeRate) : 0;
    const feeStatus = isWon ? "invoiced" : "waived";

    // 추천 따름 자동 판정: 추천가 vs 실투찰가 차이 ±0.5% 이내 = 추천 따름
    // userBidPrice 가 G2B에서 매칭됐을 때만 판정 가능
    let userFollowedRecommendation: boolean | null = null;
    if (userBidPriceFromG2B != null && recPrice > 0) {
      const diff = Math.abs(userBidPriceFromG2B - recPrice) / recPrice;
      userFollowedRecommendation = diff <= 0.005; // ±0.5%
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (admin.from("BidRequest") as any)
      .update({
        isWon,
        winnerName: res.winnerName ?? null,
        actualFinalPrice: String(Math.round(finalPrice)),
        totalBidders: res.numBidders ?? null,
        openingDt: res.openedAt ?? null,
        actualSajungRate: actualSajungRate?.toFixed(4) ?? null,
        deviationPct: deviationPct?.toFixed(4) ?? null,
        isHit,
        feeRate: feeRate.toFixed(4),
        feeAmount: String(feeAmount),
        feeStatus,
        resultDetectedAt: now,
        // 사용자 매칭 정보 (OpengCompt 응답)
        ...(userRank != null ? { userRank } : {}),
        ...(userBidPriceFromG2B != null ? { userBidPrice: String(userBidPriceFromG2B) } : {}),
        ...(userBidRate != null ? { userBidRate: userBidRate.toFixed(4) } : {}),
        ...(userDrwtNo1 != null ? { userDrwtNo1 } : {}),
        ...(userDrwtNo2 != null ? { userDrwtNo2 } : {}),
        ...(userBidAtFromG2B != null ? { userBidAt: userBidAtFromG2B } : {}),
        ...(userFollowedRecommendation != null ? { userFollowedRecommendation } : {}),
      })
      .eq("id", req.id);

    if (updateErr) {
      console.error("[refresh-outcomes] 업데이트 오류:", req.id, updateErr.message);
    } else {
      updated++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. AIPrediction 결과 채움 — AIPrediction.konepsId 직접 사용
  // (AccuracyClient 표의 "실제결과" 컬럼 데이터 소스)
  // ─────────────────────────────────────────────────────────────
  let aiUpdated = 0;
  let aiScanned = 0;
  let aiNoResult = 0;     // BidResult 매칭 실패 (G2B 직접 조회도 실패)
  let aiNoBase = 0;       // 기초금액 0
  let aiBadPredicted = 0; // predictedSajungRate 0
  let aiG2bFetched = 0;   // G2B 직접 조회로 신규 BidResult 확보
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: aiPending } = await (admin.from("AIPrediction") as any)
      .select("annId,konepsId,predictedSajungRate,budget,deadline")
      .is("resultFilledAt", null)
      .limit(500);

    aiScanned = (aiPending ?? []).length;

    if (aiScanned > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiKonepsIds = [...new Set(((aiPending ?? []) as any[]).map(a => a.konepsId).filter(Boolean))];

      // BidResult + Announcement.bsisAmt 병렬 조회
      const [resultRes, annRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin.from("BidResult") as any)
          .select("annId,finalPrice,bidRate,winnerName")
          .in("annId", aiKonepsIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin.from("Announcement") as any)
          .select("konepsId,bsisAmt,budget,aValueAmt")
          .in("konepsId", aiKonepsIds),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const konepsToResult: Record<string, any> = Object.fromEntries(((resultRes.data ?? []) as any[]).map(r => [r.annId, r]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const konepsToAnn: Record<string, any> = Object.fromEntries(((annRes.data ?? []) as any[]).map(a => [a.konepsId, a]));

      const nowDate = new Date();
      let g2bCallsThisRun = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of ((aiPending ?? []) as any[])) {
        const koneps = p.konepsId;
        if (!koneps) { aiNoResult++; continue; }

        let res = konepsToResult[koneps];

        // BidResult 매칭 실패 + 마감 지남 + 이번 배치 한도 미초과 → G2B 직접 조회
        if (
          (!res || !res.finalPrice || !res.bidRate) &&
          p.deadline &&
          g2bCallsThisRun < AI_G2B_BATCH_LIMIT
        ) {
          const deadlineDate = new Date(p.deadline);
          if (deadlineDate < nowDate) {
            g2bCallsThisRun++;
            // SCSBID 단건 조회
            const found = await fetchFromG2B(koneps, deadlineDate);
            if (found) {
              const rateRaw = (found.sucsfbidRate || "").replace(/[^0-9.]/g, "");
              const priceRaw = (found.sucsfbidAmt || "").replace(/[^0-9]/g, "");
              if (rateRaw && priceRaw) {
                res = {
                  annId: koneps,
                  bidRate: parseFloat(rateRaw).toFixed(3),
                  finalPrice: String(parseInt(priceRaw, 10)),
                  numBidders: parseInt((found.prtcptCnum || found.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
                  winnerName: found.sucsfbidCorpNm?.trim() || found.bidwinnrNm?.trim() || null,
                  openedAt: found.opengDt ? g2bParseDate(found.opengDt) : null,
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (admin.from("BidResult") as any).upsert(res, { onConflict: "annId" });
                aiG2bFetched++;
              }
            }
            // SCSBID 도 실패 시 OpengResult 직접 조회 (수의계약 포함)
            if ((!res || !res.finalPrice || !res.bidRate)) {
              const opengFound = await fetchOpengFromG2B(koneps, deadlineDate);
              if (opengFound) {
                res = opengFound;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (admin.from("BidResult") as any).upsert(res, { onConflict: "annId" });
                aiG2bFetched++;
              }
            }
          }
        }

        if (!res || !res.finalPrice || !res.bidRate) { aiNoResult++; continue; }

        const ann = konepsToAnn[koneps];
        const bsis = Number(ann?.bsisAmt ?? 0);
        const avAmt = Number(ann?.aValueAmt ?? 0);
        const bud = Number(ann?.budget ?? p.budget ?? 0);
        const base = bsis > 0 ? bsis : avAmt > 0 ? avAmt : Math.round(bud * 1.1);
        if (base <= 0) { aiNoBase++; continue; }

        const finalPrice = Number(res.finalPrice);
        const bidRate = Number(res.bidRate);
        if (finalPrice <= 0 || bidRate <= 0) { aiNoResult++; continue; }

        const predicted = Number(p.predictedSajungRate ?? 0);
        if (predicted <= 0) { aiBadPredicted++; continue; }

        const actualSajung = (finalPrice / (bidRate / 100) / base) * 100;
        const dev = Math.abs(predicted - actualSajung);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (admin.from("AIPrediction") as any)
          .update({
            actualSajungRate: actualSajung.toFixed(4),
            actualFinalPrice: String(Math.round(finalPrice)),
            deviationPct: dev.toFixed(4),
            isExact: dev <= 0.2,
            isHit: dev <= 0.5,
            isNearHit: dev <= 1.0,
            resultFilledAt: now,
          })
          .eq("annId", p.annId);
        if (!updErr) aiUpdated++;
        else console.error("[refresh-outcomes] AIPrediction update 실패:", p.annId, updErr.message);
      }
    }
  } catch (e) {
    console.error("[refresh-outcomes] AIPrediction 채움 실패:", (e as Error).message);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. AIPrediction 비정상 사정율 (95% 미만 또는 105% 초과) 자동 재계산
  // 옛 fillAIPredictionResult 가 budget을 base로 잘못 써서 들어간 row 자동 정정
  // ─────────────────────────────────────────────────────────────
  let aiAnomalyFixed = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: anomalies } = await (admin.from("AIPrediction") as any)
      .select("annId,konepsId,predictedSajungRate")
      .or("actualSajungRate.gt.105,actualSajungRate.lt.95")
      .limit(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anomalyKoneps = ((anomalies ?? []) as any[]).map(r => r.konepsId).filter(Boolean);
    if (anomalyKoneps.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: brs } = await (admin.from("BidResult") as any)
        .select("annId,finalPrice,bidRate").in("annId", anomalyKoneps);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: anns } = await (admin.from("Announcement") as any)
        .select("konepsId,bsisAmt,budget,aValueAmt").in("konepsId", anomalyKoneps);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const brMap: Record<string, any> = Object.fromEntries(((brs ?? []) as any[]).map(r => [r.annId, r]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annMap2: Record<string, any> = Object.fromEntries(((anns ?? []) as any[]).map(r => [r.konepsId, r]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of ((anomalies ?? []) as any[])) {
        const br = brMap[a.konepsId];
        const ann = annMap2[a.konepsId];
        if (!br?.finalPrice || !br?.bidRate || !ann) continue;
        const bsis = Number(ann.bsisAmt ?? 0);
        const av = Number(ann.aValueAmt ?? 0);
        const bud = Number(ann.budget ?? 0);
        const base = bsis > 0 ? bsis : av > 0 ? av : Math.round(bud * 1.1);
        if (base <= 0) continue;
        const correctSajung = (Number(br.finalPrice) / (Number(br.bidRate) / 100) / base) * 100;
        if (correctSajung < 95 || correctSajung > 105) continue; // 재계산도 비정상이면 스킵
        const pred = Number(a.predictedSajungRate ?? 0);
        const dev = pred > 0 ? Math.abs(pred - correctSajung) : null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from("AIPrediction") as any).update({
          actualSajungRate: correctSajung.toFixed(4),
          deviationPct: dev?.toFixed(4) ?? null,
          isExact: dev != null && dev <= 0.2,
          isHit: dev != null && dev <= 0.5,
          isNearHit: dev != null && dev <= 1.0,
        }).eq("annId", a.annId);
        aiAnomalyFixed++;
      }
    }
  } catch (e) {
    console.error("[refresh-outcomes] anomaly fix 실패:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    total: pendingList.length,
    updated,
    skipped,
    g2bFetched,
    aiScanned,
    aiUpdated,
    aiG2bFetched,
    aiNoResult,
    aiNoBase,
    aiBadPredicted,
    aiAnomalyFixed,
  });
}
