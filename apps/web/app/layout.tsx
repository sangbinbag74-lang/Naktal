import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://naktal.me"),
  title: {
    default: "Naktal.ai — 나라장터 입찰 AI · 사정율·복수예가 번호 예측",
    template: "%s | Naktal.ai",
  },
  description:
    "공공입찰, 데이터로 답한다. 나라장터 공고를 머신러닝이 단 0.5초 만에 분석합니다. " +
    "사정율 예측, 복수예가 번호 추천, 공고문 자격 자동 분석, 낙찰 결과 추적까지 한 번에.",
  keywords: [
    "나라장터", "나라장터 입찰", "조달청 입찰", "공공입찰", "공공입찰 AI",
    "입찰분석", "입찰 분석 AI", "AI 입찰", "입찰 사이트",
    "복수예가", "복수예가 번호", "복수예가 추천", "복수예가 AI",
    "사정율", "사정율 예측", "사정률 계산", "예정가격",
    "낙찰", "낙찰확률", "낙찰가 예측", "낙찰하한가",
    "투찰가", "투찰금액", "최적 투찰가", "투찰 추천",
    "적격심사", "적격심사 계산기",
    "공고문 분석", "공고 자격 분석", "지역제한",
    "Naktal", "낙찰AI", "낙찰ai",
  ],
  authors: [{ name: "주식회사 호라이즌" }],
  creator: "Naktal.ai",
  publisher: "주식회사 호라이즌",
  category: "business",
  applicationName: "Naktal.ai",
  referrer: "origin-when-cross-origin",
  alternates: {
    canonical: "https://naktal.me",
    languages: { "ko-KR": "https://naktal.me" },
  },
  openGraph: {
    title: "Naktal.ai — 공공입찰, 데이터로 답한다",
    description:
      "나라장터 공고 한 건을 머신러닝이 단 0.5초 만에 분석. 사정율 · 복수예가 번호 · 자격 · 결과까지 한 번에.",
    url: "https://naktal.me",
    siteName: "Naktal.ai",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Naktal.ai — 공공입찰, 데이터로 답한다",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Naktal.ai — 공공입찰, 데이터로 답한다",
    description: "나라장터 공고를 AI가 0.5초 만에 분석합니다.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    other: {
      // 검색엔진 사이트 등록 후 발급받은 코드로 교체:
      // "naver-site-verification": "...",
      // "google-site-verification": "...",
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://naktal.me/#org",
        name: "주식회사 호라이즌",
        alternateName: "Naktal.ai",
        url: "https://naktal.me",
        logo: "https://naktal.me/og.png",
        description: "나라장터 공공입찰을 AI 머신러닝으로 분석하는 서비스",
        address: {
          "@type": "PostalAddress",
          streetAddress: "장대로 106, 2층 제이321호",
          addressLocality: "유성구",
          addressRegion: "대전광역시",
          addressCountry: "KR",
        },
        founder: { "@type": "Person", name: "박상빈" },
      },
      {
        "@type": "WebSite",
        "@id": "https://naktal.me/#site",
        url: "https://naktal.me",
        name: "Naktal.ai",
        description: "공공입찰, 데이터로 답한다",
        inLanguage: "ko-KR",
        publisher: { "@id": "https://naktal.me/#org" },
      },
      {
        "@type": "SoftwareApplication",
        name: "Naktal.ai",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://naktal.me",
        description: "나라장터 입찰 공고의 사정율·투찰가·복수예가 번호·자격을 AI 머신러닝으로 분석합니다.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "KRW",
          description: "분석 무제한 무료. 낙찰 시에만 수수료 발생 (1억원 이상 1.5%, 1억원 미만 1.7%).",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "어떤 입찰 방식을 지원하나요?",
            acceptedAnswer: { "@type": "Answer", text: "복수예가, 적격심사 등 일반 공공입찰 전 영역을 지원합니다. 시설공사 · 용역 · 물품 모두 분석 대상입니다." },
          },
          {
            "@type": "Question",
            name: "낙찰이 보장되나요?",
            acceptedAnswer: { "@type": "Answer", text: "낙찰을 보장하지 않습니다. AI는 통계적 확률을 높이는 도구이며, 최종 의사결정은 항상 사용자에게 있습니다." },
          },
          {
            "@type": "Question",
            name: "데이터는 어디서 가져오나요?",
            acceptedAnswer: { "@type": "Answer", text: "조달청 나라장터 공식 데이터를 사용합니다." },
          },
          {
            "@type": "Question",
            name: "수수료는 어떻게 되나요?",
            acceptedAnswer: { "@type": "Answer", text: "낙찰 시에만 수수료가 발생합니다. 낙찰 금액 1억원 이상은 1.5%, 1억원 미만은 1.7%. 미낙찰 시 0원이며 분석은 무제한 무료입니다." },
          },
        ],
      },
    ],
  };

  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F1E3C" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
