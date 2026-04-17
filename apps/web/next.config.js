/** @type {import('next').NextConfig} */
const nextConfig = {
  // ML Route Handler가 fs.readFileSync로 읽는 ml/ 폴더를 Vercel 번들에 포함
  outputFileTracingIncludes: {
    "/api/ml-predict": ["./ml/**/*"],
  },
  // onnxruntime-web은 WASM 바이너리 → 서버 번들에 포함되도록 external 처리
  serverExternalPackages: ["onnxruntime-web"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js 요구
              "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net",
              "img-src 'self' data: blob:",
              "font-src 'self' cdn.jsdelivr.net",
              "connect-src 'self' *.supabase.co wss://*.supabase.co apis.data.go.kr",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
