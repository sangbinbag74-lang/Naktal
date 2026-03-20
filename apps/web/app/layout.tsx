import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "낙탈AI — 번호 전략으로 입찰을 이기다",
    template: "%s — 낙탈AI",
  },
  description:
    "나라장터 복수예가 번호 최적화 AI. 수만 건 개찰 데이터로 최적 번호 조합을 제안하고, 적격심사 통과 가능성을 자동 산출합니다.",
  keywords: ["나라장터", "입찰", "복수예가", "번호 추천", "적격심사", "낙찰", "공공입찰"],
  openGraph: {
    title: "낙탈AI — 이 공고 몇 번 넣어야 해요?",
    description: "수만 건 개찰 데이터가 답합니다. 번호 역이용 AI + 실시간 참여자 수 + 적격심사 계산기.",
    url: "https://naktal.me",
    siteName: "낙탈AI",
    locale: "ko_KR",
    type: "website",
  },
  robots: { index: true, follow: true },
  metadataBase: new URL("https://naktal.me"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F1E3C" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  );
}
