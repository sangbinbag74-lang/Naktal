import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";
import { MobileNotice } from "@/components/common/MobileNotice";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me"),
  title: {
    default: "낙비 — 내 손안의 AI 낙찰비서 · 나라장터 입찰 분석",
    template: "%s | 낙비",
  },
  description:
    "낙비는 내 손안의 AI 낙찰비서입니다. 나라장터 공고를 머신러닝이 단 0.5초 만에 분석해 " +
    "사정율 예측, 복수예가 번호 추천, 공고문 자격 자동 분석, 낙찰 결과 추적까지 한 번에 제공합니다. " +
    "분석 무제한 무료, 낙찰 성공 시에만 수수료 발생.",
  keywords: [
    // 브랜드명 변형
    "낙비", "낙비ai", "낙비AI", "NAKBI", "nakbi", "낙비비서", "낙비낙찰", "naktal", "Naktal",
    "낙찰비서", "AI 낙찰비서", "AI낙찰비서", "내 손안의 낙찰비서",
    // 핵심 키워드
    "나라장터", "나라장터 입찰", "나라장터 AI", "조달청", "조달청 입찰", "조달청 AI",
    "공공입찰", "공공입찰 AI", "공공조달", "전자입찰",
    "입찰분석", "입찰 분석", "입찰 분석 AI", "AI 입찰", "입찰 사이트", "입찰정보",
    // 복수예가
    "복수예가", "복수예가 번호", "복수예가 추천", "복수예가 AI", "복수예가 예측",
    // 사정율
    "사정율", "사정율 예측", "사정률", "사정률 계산", "사정률 예측",
    "예정가격", "예정가격 계산", "예정가",
    // 낙찰
    "낙찰", "낙찰확률", "낙찰률", "낙찰가 예측", "낙찰하한가", "낙찰하한율",
    "낙찰AI", "낙찰ai", "낙찰 AI 분석", "낙찰가 분석", "낙찰 예측",
    // 투찰
    "투찰가", "투찰금액", "최적 투찰가", "투찰 추천", "투찰가 계산", "투찰 분석",
    // 적격심사
    "적격심사", "적격심사 계산기", "적격심사 통과", "PQ 심사",
    // 공고 분석
    "공고문 분석", "공고 자격 분석", "지역제한", "업종제한", "참가자격",
    // 머신러닝
    "머신러닝 입찰", "AI 분석", "데이터 분석", "빅데이터 입찰",
  ],
  authors: [{ name: "주식회사 호라이즌" }],
  creator: "낙비",
  publisher: "주식회사 호라이즌",
  category: "business",
  applicationName: "낙비",
  referrer: "origin-when-cross-origin",
  alternates: {
    canonical: "https://naktal.me",
    languages: { "ko-KR": "https://naktal.me" },
    types: {
      "application/rss+xml": [
        { url: "https://naktal.me/rss.xml", title: "낙비 RSS" },
      ],
    },
  },
  openGraph: {
    title: "낙비 — 내 손안의 AI 낙찰비서",
    description:
      "나라장터 공고 한 건을 머신러닝이 단 0.5초 만에 분석. 사정율 · 복수예가 번호 · 자격 · 결과까지 한 번에.",
    url: "https://naktal.me",
    siteName: "낙비",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "낙비 — 내 손안의 AI 낙찰비서",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "낙비 — 내 손안의 AI 낙찰비서",
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
    google: "k7bqS0a6GuynUrEatPT2zj_Gzue1TxwBOC8snTaalvM",
    other: {
      "naver-site-verification": "689dd8fa9c79ef28ce8e35391c0a6ec4ced1e75a",
    },
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
        alternateName: ["낙비", "낙비AI", "내 손안의 AI 낙찰비서", "NAKBI"],
        legalName: "주식회사 호라이즌",
        url: "https://naktal.me",
        logo: "https://naktal.me/og.png",
        image: "https://naktal.me/og.png",
        description: "낙비 — 내 손안의 AI 낙찰비서. 나라장터 공공입찰을 머신러닝으로 분석합니다.",
        address: {
          "@type": "PostalAddress",
          streetAddress: "장대로 106, 2층 제이321호",
          addressLocality: "유성구",
          addressRegion: "대전광역시",
          postalCode: "34134",
          addressCountry: "KR",
        },
        founder: { "@type": "Person", name: "박상빈" },
        contactPoint: {
          "@type": "ContactPoint",
          telephone: "+82-63-831-9882",
          contactType: "customer service",
          areaServed: "KR",
          availableLanguage: ["Korean"],
        },
        taxID: "398-87-03453",
        sameAs: [
          "http://pf.kakao.com/_SQxmKX",
        ],
      },
      {
        "@type": "WebSite",
        "@id": "https://naktal.me/#site",
        url: "https://naktal.me",
        name: "낙비",
        alternateName: ["낙비AI", "Naktal", "내 손안의 AI 낙찰비서"],
        description: "내 손안의 AI 낙찰비서 — 나라장터 공고를 머신러닝이 0.5초 만에 분석",
        inLanguage: "ko-KR",
        publisher: { "@id": "https://naktal.me/#org" },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://naktal.me/announcements?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "낙비",
        alternateName: "내 손안의 AI 낙찰비서",
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
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.7",
          ratingCount: "120",
          bestRating: "5",
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
        <MobileNotice />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
