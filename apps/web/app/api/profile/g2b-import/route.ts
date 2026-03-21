import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchG2BCompanyInfo, fetchG2BContracts } from "@/lib/g2b-company";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bizNo = req.nextUrl.searchParams.get("bizNo")?.replace(/[^0-9]/g, "");
  if (!bizNo || bizNo.length !== 10) {
    return NextResponse.json({ error: "사업자번호 10자리를 입력하세요" }, { status: 400 });
  }

  try {
    const [companyInfo, contracts] = await Promise.all([
      fetchG2BCompanyInfo(bizNo),
      fetchG2BContracts(bizNo),
    ]);

    if (!companyInfo || companyInfo.licenses.length === 0) {
      return NextResponse.json(
        { error: "해당 사업자번호로 나라장터에 등록된 면허·업종 정보를 찾을 수 없습니다. 나라장터에 조달업체로 등록된 사업자번호인지 확인해주세요." },
        { status: 404 }
      );
    }

    return NextResponse.json({ companyInfo, contracts });
  } catch (err) {
    console.error("[G2B import]", err);
    return NextResponse.json(
      { error: "나라장터 API 오류가 발생했습니다" },
      { status: 502 }
    );
  }
}
