/** @type {import('next').NextConfig} */
const nextConfig = {
  // ML Route Handler가 fs.readFileSync로 읽는 ml/ 폴더를 Vercel 번들에 포함
  outputFileTracingIncludes: {
    "/api/ml-predict": ["./ml/**/*"],
  },
  // onnxruntime-node는 네이티브 바이너리 사용 → webpack에서 제외
  serverExternalPackages: ["onnxruntime-node"],
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
