import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "낙탈AI — 나라장터 입찰 최적 투찰가 AI 분석",
    template: "%s — 낙탈AI",
  },
  description:
    "나라장터 복수예가 최적 투찰금액과 낙찰 확률을 AI로 계산합니다. " +
    "발주처별 사정율 패턴 분석, 몬테카를로 낙찰확률 시뮬레이션.",
  keywords: [
    "나라장터", "입찰분석", "복수예가", "사정율", "낙찰확률",
    "투찰금액", "번호추천", "적격심사", "공공입찰AI",
  ],
  openGraph: {
    title: "낙탈AI — 이 공고, 얼마에 넣어야 낙찰될까요?",
    description: "수만 건 개찰 데이터가 최적 투찰금액을 알려드립니다. 발주처 패턴 분석 → 사정율 예측 → 낙찰 확률 계산.",
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
