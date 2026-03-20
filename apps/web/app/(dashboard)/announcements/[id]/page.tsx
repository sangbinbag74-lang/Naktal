import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Announcement {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  budget: string;
  deadline: string;
  category: string;
  region: string;
  createdAt: string;
}

function formatBudget(budget: string): string {
  const num = parseInt(budget, 10);
  return isNaN(num) ? budget : new Intl.NumberFormat("ko-KR").format(num) + "원";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: ann, error } = await supabase
    .from("Announcement")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ann) notFound();

  const announcement = ann as Announcement;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link href="/announcements">
          <Button variant="ghost" size="sm">← 목록으로</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-2 flex-wrap mb-2">
            {announcement.category && <Badge variant="secondary">{announcement.category}</Badge>}
            {announcement.region && <Badge variant="outline">{announcement.region}</Badge>}
          </div>
          <CardTitle className="text-xl">{announcement.title}</CardTitle>
          <p className="text-sm text-gray-500">공고번호: {announcement.konepsId}</p>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">발주기관</dt>
              <dd className="mt-1 text-sm text-gray-900">{announcement.orgName}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">기초금액</dt>
              <dd className="mt-1 text-sm font-semibold text-[#1E3A5F]">
                {formatBudget(announcement.budget)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">입찰마감일시</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(announcement.deadline)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">등록일</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(announcement.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
