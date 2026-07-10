"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ──────────────────────────────────────────────────────────────
   Naktal.ai 랜딩 페이지 (Claude Design handoff 구현)
   ────────────────────────────────────────────────────────────── */

const styles = `
  :root{
    --navy-900:#0F1E3C; --navy-800:#1B3A6B; --navy-700:#152E58; --navy-600:#1E4080;
    --blue-400:#60A5FA; --blue-300:#93C5FD; --blue-50:#EFF6FF;
    --green-600:#059669; --green-400:#34D399;
    --page:#F0F2F5; --card:#FFFFFF; --cell:#F8FAFC;
    --border:#E8ECF2; --border-light:#F1F5F9;
    --fg-1:#0F172A; --fg-2:#334155; --fg-3:#64748B; --fg-4:#94A3B8;
  }
  .nk-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";}
  .nk-en{font-family:'Inter','Pretendard',-apple-system,sans-serif;}
  .nk-eyebrow{font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;}
  .nk-container{max-width:1200px;margin:0 auto;padding:0 32px;}
  @media (max-width:768px){.nk-container{padding:0 20px;}}
  .nk-reveal{opacity:0;transform:translateY(12px);transition:opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1);}
  .nk-reveal.in{opacity:1;transform:none;}
  .nk-cta-primary{background:var(--navy-800);color:#fff;border:none;height:52px;padding:0 28px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:-0.01em;display:inline-flex;align-items:center;gap:10px;transition:background .15s;text-decoration:none;cursor:pointer;}
  .nk-cta-primary:hover{background:var(--navy-700);}
  .nk-cta-onDark{background:#fff;color:var(--navy-800);border:none;height:52px;padding:0 28px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:-0.01em;display:inline-flex;align-items:center;gap:10px;transition:background .15s;text-decoration:none;cursor:pointer;}
  .nk-cta-onDark:hover{background:#F1F5F9;}
  .nk-cta-ghost-dark{background:transparent;color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.2);height:52px;padding:0 24px;border-radius:12px;font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:8px;transition:background .15s, border-color .15s;text-decoration:none;}
  .nk-cta-ghost-dark:hover{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.35);}
  .nk-nav{position:sticky;top:0;z-index:60;backdrop-filter:saturate(160%) blur(8px);-webkit-backdrop-filter:saturate(160%) blur(8px);}
  .nk-feat{background:#fff;border:1px solid var(--border);border-radius:16px;padding:28px 26px 26px;transition:box-shadow .2s ease, border-color .2s ease, transform .2s ease;}
  .nk-feat:hover{border-color:#D6DCE6;box-shadow:0 8px 24px rgba(15,30,60,0.06);}
  details.nk-faq{border-bottom:1px solid var(--border);padding:22px 0;}
  details.nk-faq summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:24px;}
  details.nk-faq summary::-webkit-details-marker{display:none;}
  details.nk-faq summary .nk-q{font-size:17px;font-weight:700;letter-spacing:-0.018em;color:var(--fg-1);}
  details.nk-faq summary .nk-plus{width:28px;height:28px;border-radius:999px;border:1px solid var(--border);display:grid;place-items:center;color:var(--fg-3);font-size:18px;font-weight:300;line-height:1;flex-shrink:0;transition:transform .2s, background .2s, color .2s;}
  details.nk-faq[open] summary .nk-plus{transform:rotate(45deg);background:var(--navy-800);color:#fff;border-color:var(--navy-800);}
  details.nk-faq .nk-a{font-size:15px;line-height:1.7;color:var(--fg-2);margin-top:14px;max-width:780px;}
  @keyframes nk-pulse-dot {0%,100%{opacity:.35;}50%{opacity:1;}}
`;

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".nk-reveal");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Charts ──────────────────────────────────────────────────── */

function HeroViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const W = () => cv.getBoundingClientRect().width;
    const H = () => cv.getBoundingClientRect().height;

    const N = 260;
    const pts = Array.from({ length: N }, () => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      const x = 0.5 + g * 0.13;
      return { targetX: x, x: Math.random(), y: Math.random(), size: 1.2 + Math.random() * 1.8, delay: Math.random() * 1.6 };
    });

    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const w = W(), h = H();
      ctx.clearRect(0, 0, w, h);
      const baseY = h * 0.78;
      const amp = h * 0.55;
      const sigma = w * 0.15;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const px = (i / 200) * w;
        const dx = px - w / 2;
        const py = baseY - amp * Math.exp(-(dx * dx) / (2 * sigma * sigma));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = "rgba(96,165,250,0.45)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.lineTo(w, baseY);
      ctx.lineTo(0, baseY);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(96,165,250,0.18)");
      g.addColorStop(1, "rgba(96,165,250,0)");
      ctx.fillStyle = g;
      ctx.fill();

      pts.forEach((p) => {
        const local = Math.max(0, Math.min(1, (t - p.delay) / 1.6));
        const eased = 1 - Math.pow(1 - local, 3);
        const tx = p.targetX * w;
        const dx = tx - w / 2;
        const ty = baseY - amp * Math.exp(-(dx * dx) / (2 * sigma * sigma)) - 6;
        const sx = p.x * w;
        const sy = p.y * h * 0.4;
        const px = sx + (tx - sx) * eased;
        const py = sy + (ty - sy) * eased;
        const a = eased * 0.85 + Math.sin(t * 1.4 + p.delay * 4) * 0.05;
        ctx.fillStyle = `rgba(96,165,250,${Math.max(0, a)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      const sweepX = ((Math.sin(t * 0.35) + 1) / 2) * w;
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sweepX, 8);
      ctx.lineTo(sweepX, h - 8);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

function Sparkline({ seed = 1, color = "#60A5FA", stroke = 1.5, height = 44 }: { seed?: number; color?: string; stroke?: number; height?: number }) {
  const pts: number[] = [];
  let s = seed;
  for (let i = 0; i < 32; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    pts.push(0.5 + Math.sin(i * 0.4 + seed) * 0.25 + (r - 0.5) * 0.18);
  }
  const max = Math.max(...pts), min = Math.min(...pts);
  const norm = pts.map((p) => (p - min) / (max - min + 0.0001));
  const W = 140, H = height;
  const path = norm.map((v, i) => {
    const x = (i / (norm.length - 1)) * W;
    const y = H - v * H * 0.85 - 4;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = path + ` L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniHistogram() {
  const N = 22, mid = N / 2;
  const bars = Array.from({ length: N }, (_, i) => {
    const d = (i - mid) / 4;
    return Math.exp(-d * d) * (0.82 + Math.sin(i * 1.2) * 0.06);
  });
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
      {bars.map((b, i) => {
        const isPeak = Math.abs(i - mid) < 2;
        return <div key={i} style={{ flex: 1, height: `${b * 100}%`, background: isPeak ? "var(--blue-400)" : "rgba(27,58,107,0.55)", borderRadius: "2px 2px 0 0" }} />;
      })}
    </div>
  );
}

function Heatmap({ cols = 14, rows = 6 }: { cols?: number; rows?: number }) {
  const cells: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = (Math.sin(r * 1.3 + c * 0.8) + Math.cos(c * 0.5 - r * 0.6) + 2) / 4;
      cells.push(v);
    }
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 3 }}>
      {cells.map((v, i) => (
        <div key={i} style={{ aspectRatio: "1", borderRadius: 3, background: `rgba(27,58,107,${0.08 + v * 0.72})` }} />
      ))}
    </div>
  );
}

function NumberLottery() {
  const picks = [3, 7, 9, 14];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
      {Array.from({ length: 15 }, (_, i) => {
        const n = i + 1;
        const on = picks.includes(n);
        return (
          <div key={n} style={{
            aspectRatio: "1", display: "grid", placeItems: "center", borderRadius: 8,
            background: on ? "var(--navy-800)" : "#F8FAFC",
            color: on ? "#fff" : "var(--fg-4)",
            border: on ? "1px solid var(--navy-800)" : "1px solid var(--border)",
            fontSize: 13, fontWeight: on ? 700 : 500, fontVariantNumeric: "tabular-nums",
            boxShadow: on ? "0 4px 12px rgba(27,58,107,0.18)" : "none",
          }}>{String(n).padStart(2, "0")}</div>
        );
      })}
    </div>
  );
}

function DocFragment() {
  const lines = [1, 0.6, 0.85, 0.4, 0.7, 0.9, 0.55];
  const tagged = [1, 4];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((w, i) => {
        const t = tagged.includes(i);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 3, background: t ? "rgba(96,165,250,0.35)" : "#E8ECF2", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${w * 100}%`, background: t ? "var(--blue-400)" : "#CBD5E1", borderRadius: 3 }} />
            </div>
            {t && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--navy-800)", background: "var(--blue-50)", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>TAG</div>}
          </div>
        );
      })}
    </div>
  );
}

function TrackTable() {
  const rows = [
    { p: "적중", c: "var(--green-600)", bg: "#F0FDF4" },
    { p: "적중", c: "var(--green-600)", bg: "#F0FDF4" },
    { p: "근접", c: "#C2410C", bg: "#FFF7ED" },
    { p: "적중", c: "var(--green-600)", bg: "#F0FDF4" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ height: 6, flex: 1, background: "#E8ECF2", borderRadius: 3, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, width: `${70 + i * 7}%`, background: "var(--navy-800)", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: r.c, background: r.bg, padding: "2px 7px", borderRadius: 4, minWidth: 36, textAlign: "center" }}>{r.p}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Sections ────────────────────────────────────────────────── */

function Nav({ scrolled }: { scrolled: boolean }) {
  return (
    <div className="nk-nav" style={{
      background: scrolled ? "rgba(255,255,255,0.92)" : "rgba(15,30,60,0)",
      borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
      transition: "background .25s, border-color .25s",
    }}>
      <div className="nk-container" style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: scrolled ? "var(--navy-800)" : "#fff",
            color: scrolled ? "#fff" : "var(--navy-800)",
            display: "grid", placeItems: "center", fontWeight: 900, fontSize: 15, letterSpacing: "-0.04em",
            transition: "background .25s, color .25s",
          }}>낙</div>
          <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.025em", color: scrolled ? "var(--fg-1)" : "#fff", transition: "color .25s" }}>
              낙비
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, color: scrolled ? "var(--fg-3)" : "rgba(255,255,255,0.65)", marginTop: 1, transition: "color .25s" }}>
              내 손안의 AI 낙찰비서
            </span>
          </span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[["엔진", "#engines"], ["프로세스", "#flow"], ["신뢰성", "#trust"], ["FAQ", "#faq"]].map(([l, h]) => (
            <a key={h} href={h} style={{ fontSize: 13.5, fontWeight: 500, padding: "8px 14px", color: scrolled ? "var(--fg-2)" : "rgba(255,255,255,0.8)", transition: "color .25s", textDecoration: "none" }}>{l}</a>
          ))}
          <Link href="/login" className="nk-cta-primary" style={{
            height: 38, padding: "0 18px", fontSize: 13.5, marginLeft: 8,
            background: scrolled ? "var(--navy-800)" : "#fff",
            color: scrolled ? "#fff" : "var(--navy-800)",
          }}>분석 시작</Link>
        </nav>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section style={{
      position: "relative", color: "#fff",
      paddingTop: 160, paddingBottom: 120, overflow: "hidden",
      background: "linear-gradient(180deg, #0F1E3C 0%, #1B3A6B 100%)",
      marginTop: -64,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(rgba(96,165,250,0.07) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        maskImage: "radial-gradient(ellipse at center top, #000 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse at center top, #000 30%, transparent 75%)",
        pointerEvents: "none",
      }} />
      <div className="nk-container" style={{ position: "relative" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)", color: "var(--blue-300)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green-400)", boxShadow: "0 0 0 4px rgba(52,211,153,0.18)", animation: "nk-pulse-dot 2.4s ease-in-out infinite" }} />
          <span className="nk-eyebrow" style={{ fontSize: 11, letterSpacing: "0.16em", color: "#fff" }}>PROCUREMENT INTELLIGENCE</span>
        </div>

        <h1 style={{ fontSize: "clamp(44px, 7vw, 88px)", lineHeight: 1.04, letterSpacing: "-0.035em", fontWeight: 900, margin: "28px 0 26px", maxWidth: 1080 }}>
          직감의 시대는 끝났다.<br />
          입찰은 이제 <span style={{ color: "var(--blue-400)" }}>데이터다.</span>
        </h1>

        <p style={{ fontSize: "clamp(17px, 1.6vw, 21px)", lineHeight: 1.55, color: "rgba(255,255,255,0.72)", maxWidth: 680, margin: "0 0 44px", fontWeight: 400 }}>
          <strong style={{ color: "#fff", fontWeight: 700 }}>낙비</strong> — 내 손안의 AI 낙찰비서.<br />
          나라장터 공고의 사정율·복수예가 번호·참여 자격을<br />머신러닝이 단 <span style={{ color: "#fff", fontWeight: 600 }}>0.5초</span> 만에 분석합니다.<br />
          <span style={{ color: "var(--blue-300)", fontWeight: 600 }}>낙찰 수수료 0원</span> — 무료로 시작하세요.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 84 }}>
          <Link href="/signup" className="nk-cta-onDark">무료로 시작하기 <span aria-hidden>→</span></Link>
          <a href="#engines" className="nk-cta-ghost-dark">엔진 살펴보기</a>
        </div>

        <div style={{ position: "relative", borderRadius: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", padding: "22px 24px", backdropFilter: "blur(6px)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "#F87171", boxShadow: "0 0 0 3px rgba(248,113,113,0.18)" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.14em", fontWeight: 700, textTransform: "uppercase" }}>LIVE FEED</span>
              </div>
              <div style={{ height: 14, width: 1, background: "rgba(255,255,255,0.15)" }} />
              <div style={{ display: "flex", gap: 24 }}>
                {[["사정율 분포", "σ"], ["추천 점수", "P"], ["수렴 곡선", "μ"]].map(([l, k]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="nk-en nk-num" style={{ fontSize: 11, color: "var(--blue-400)", fontWeight: 700 }}>{k}</span>
                    <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)" }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              <span className="nk-en">REALTIME</span>
              <span style={{ width: 4, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.3)" }} />
              <span className="nk-en nk-num">0.5s</span>
            </div>
          </div>

          <div style={{ height: 300, position: "relative", borderRadius: 12, background: "rgba(15,30,60,0.4)", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <HeroViz />
            <div style={{ position: "absolute", left: 14, bottom: 10, fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" }}>LOWER BOUND</div>
            <div style={{ position: "absolute", right: 14, bottom: 10, fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" }}>UPPER BOUND</div>
            <div style={{ position: "absolute", left: "50%", top: 14, transform: "translateX(-50%)", fontSize: 10, color: "var(--blue-300)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700 }}>OPTIMAL ZONE</div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[["공고", "자동 수집"], ["공고문", "자동 파싱"], ["패턴", "학습"], ["투찰가", "산출"]].map(([k, v], i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>{`STEP ${String(i + 1).padStart(2, "0")}`}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{k}<span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400, marginLeft: 6 }}>{v}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const items = [
    "엑셀과 직감으로 입찰하던 시대",
    "수십 건의 공고를 매일 손으로 검색",
    "발주처 패턴을 머릿속에서 추정",
    "사정율 예측은 사실상 운",
  ];
  return (
    <section style={{ background: "#fff", borderTop: "1px solid var(--border)", padding: "120px 0" }}>
      <div className="nk-container" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.9fr) 1.4fr", gap: 80, alignItems: "start" }}>
        <div className="nk-reveal">
          <div className="nk-eyebrow" style={{ color: "var(--fg-4)", marginBottom: 18 }}>THE OLD WAY</div>
          <h2 style={{ fontSize: "clamp(34px, 4vw, 52px)", lineHeight: 1.1, letterSpacing: "-0.028em", fontWeight: 900, margin: 0, color: "var(--fg-1)" }}>
            이걸 데이터가<br />풀 수 있다면?
          </h2>
        </div>
        <div className="nk-reveal">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", borderTop: "1px solid var(--border)" }}>
            {items.map((t, i) => (
              <li key={i} style={{ padding: "22px 0", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: 24 }}>
                <span className="nk-en nk-num" style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-4)", minWidth: 40 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg-2)", flex: 1, textDecoration: "line-through", textDecorationColor: "rgba(220,38,38,0.35)", textDecorationThickness: 2 }}>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Engines() {
  const cards = [
    { tag: "ENGINE 01", title: "사정율 예측 엔진", lines: ["공고별 예정가격을 머신러닝으로 정밀 예측합니다.", "발주처·업종·예산·지역·계절성까지 동시에 학습.", "사람이 발견할 수 없는 패턴을 AI가 찾아냅니다."], viz: "histogram" },
    { tag: "ENGINE 02", title: "복수예가 번호 추천", lines: ["15개 예비가 번호 중 어떤 4개가 뽑힐지 — AI가 예측합니다.", "방대한 개찰 데이터 학습 기반 4종 조합 자동 추천.", "고빈도 번호 회피, 저빈도 조합 강조."], viz: "lottery" },
    { tag: "ENGINE 03", title: "공고문 자격 자동 분석", lines: ["공고 PDF 본문을 자동으로 읽고 자격 요건을 요약합니다.", "지역제한·면허·실적·업종까지 한 화면에서 확인.", "공고 시간이 아닌 분석 시간만 남깁니다."], viz: "doc" },
    { tag: "ENGINE 04", title: "낙찰 결과 자동 추적", lines: ["투찰 후 결과를 자동으로 가져옵니다.", "AI 예측 vs 실제 — 매번 정확도를 검증합니다.", "분석 이력은 곧 당신의 자산이 됩니다."], viz: "track" },
  ];
  return (
    <section id="engines" style={{ background: "var(--page)", padding: "120px 0" }}>
      <div className="nk-container">
        <div className="nk-reveal" style={{ maxWidth: 760, marginBottom: 64 }}>
          <div className="nk-eyebrow" style={{ color: "var(--navy-800)", marginBottom: 16 }}>THE ENGINES</div>
          <h2 style={{ fontSize: "clamp(34px, 4vw, 52px)", lineHeight: 1.1, letterSpacing: "-0.028em", fontWeight: 900, margin: "0 0 18px" }}>
            공고 한 건, <span style={{ color: "var(--navy-800)" }}>네 가지 관점</span>으로<br />동시에 분석합니다.
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--fg-3)", margin: 0, maxWidth: 600 }}>
            가격을 정밀히 예측하고, 번호를 역으로 잡고, 자격을 자동으로 읽고, 결과를 끝까지 추적합니다.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {cards.map((c, i) => (
            <div key={i} className="nk-feat nk-reveal" style={{ display: "grid", gridTemplateRows: "auto auto 1fr auto", minHeight: 380 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <div className="nk-eyebrow nk-en" style={{ color: "var(--blue-400)", fontWeight: 800, letterSpacing: "0.16em" }}>{c.tag}</div>
                <div className="nk-en nk-num" style={{ fontSize: 11, color: "var(--fg-4)", letterSpacing: "0.08em" }}>{String(i + 1).padStart(2, "0")} / 04</div>
              </div>
              <h3 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.024em", margin: "0 0 18px", color: "var(--fg-1)" }}>{c.title}</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {c.lines.map((l, j) => (
                  <li key={j} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, marginTop: 9, width: 5, height: 5, borderRadius: 999, background: j === 0 ? "var(--navy-800)" : "var(--fg-4)" }} />
                    <span style={{ fontSize: 15, lineHeight: 1.6, color: j === 0 ? "var(--fg-1)" : "var(--fg-3)", fontWeight: j === 0 ? 600 : 400 }}>{l}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
                {c.viz === "histogram" && <MiniHistogram />}
                {c.viz === "lottery" && <NumberLottery />}
                {c.viz === "doc" && <DocFragment />}
                {c.viz === "track" && <TrackTable />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyAccurate() {
  const items = [
    { k: "01", t: "결합 학습", d: "최신 머신러닝 알고리즘과 깊이 있는 통계 분석을 결합합니다." },
    { k: "02", t: "즉시 분석", d: "공고가 등록되는 순간, 모델이 즉시 분석을 시작합니다." },
    { k: "03", t: "계속되는 학습", d: "수년치 입찰 데이터를 매일 다시 학습 — 모델은 멈추지 않습니다." },
    { k: "04", t: "투명한 예측", d: "AI 예측 사정율을 그대로 추천 — 임의 보정 없이 G2B 계산기로 직접 검증할 수 있습니다." },
  ];
  return (
    <section style={{ background: "var(--navy-900)", color: "#fff", padding: "120px 0", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(96,165,250,0.06) 1px, transparent 1px)", backgroundSize: "30px 30px", maskImage: "linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)", WebkitMaskImage: "linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)" }} />
      <div className="nk-container" style={{ position: "relative" }}>
        <div className="nk-reveal" style={{ marginBottom: 64, maxWidth: 760 }}>
          <div className="nk-eyebrow" style={{ color: "var(--blue-400)", marginBottom: 16 }}>WHY IT WORKS</div>
          <h2 style={{ fontSize: "clamp(34px, 4vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.028em", fontWeight: 900, margin: "0 0 18px", color: "#fff" }}>
            정확도가 다른 이유.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          {items.map((it, i) => (
            <div key={i} className="nk-reveal" style={{ padding: "32px 28px 36px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.12)" : "none", position: "relative" }}>
              <div className="nk-en nk-num" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue-400)", letterSpacing: "0.08em", marginBottom: 18 }}>{it.k}</div>
              <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.022em", margin: "0 0 14px", color: "#fff" }}>{it.t}</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "rgba(255,255,255,0.65)", margin: 0 }}>{it.d}</p>
            </div>
          ))}
        </div>

        <div className="nk-reveal" style={{ marginTop: 64, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 48, alignItems: "center", padding: "40px 44px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div className="nk-eyebrow nk-en" style={{ color: "var(--blue-400)", marginBottom: 14 }}>PATTERN MAP</div>
            <h3 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.022em", margin: "0 0 14px", color: "#fff" }}>발주처 × 업종 × 시기.</h3>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.65)", margin: 0, maxWidth: 380 }}>
              수많은 발주처가 각자 다른 패턴을 가집니다. 모델은 그 차이를 학습해 공고마다 다른 결과를 냅니다.
            </p>
          </div>
          <div style={{ padding: 14, background: "rgba(0,0,0,0.25)", borderRadius: 12 }}>
            <Heatmap cols={14} rows={6} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <span>업종 →</span>
              <span>↓ 발주처</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DataScale() {
  const big = [
    { n: "750만", u: "건", l: "누적 공고", d: "지난 24년간 학습" },
    { n: "520만", u: "건", l: "낙찰 결과", d: "모델의 기초 데이터" },
    { n: "740만", u: "건", l: "개찰 번호", d: "복수예가 AI 학습 소스" },
    { n: "3,120만", u: "건", l: "공고 변경 이력", d: "끝까지 추적" },
  ];
  return (
    <section style={{ background: "#fff", padding: "140px 0 120px", borderTop: "1px solid var(--border)" }}>
      <div className="nk-container">
        <div className="nk-reveal" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "flex-end", marginBottom: 72 }}>
          <div>
            <div className="nk-eyebrow" style={{ color: "var(--navy-800)", marginBottom: 18 }}>THE SCALE</div>
            <h2 style={{ fontSize: "clamp(40px, 5vw, 64px)", lineHeight: 1.04, letterSpacing: "-0.032em", fontWeight: 900, margin: 0 }}>
              <span className="nk-num nk-en" style={{ fontSize: "clamp(80px, 11vw, 156px)", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.06em", color: "var(--navy-800)", display: "block", marginBottom: 14 }}>
                5,300<span style={{ fontSize: "0.42em", color: "var(--blue-400)", marginLeft: 6 }}>만+</span>
              </span>
              건의 데이터 위에서<br />작동하는 입찰 AI.
            </h2>
          </div>
          <div style={{ paddingBottom: 24 }}>
            <p style={{ fontSize: 18, lineHeight: 1.65, color: "var(--fg-2)", margin: "0 0 20px", maxWidth: 440, fontWeight: 500 }}>
              24년치 공공조달 기록이 모델의 토대입니다. 모든 예측은 이 데이터 위에서 계산됩니다.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "12px 18px", borderRadius: 999, background: "var(--cell)", border: "1px solid var(--border)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--green-600)", boxShadow: "0 0 0 4px rgba(5,150,105,0.15)", animation: "nk-pulse-dot 2.4s ease-in-out infinite" }} />
              <span style={{ fontSize: 13, color: "var(--fg-2)", fontWeight: 600 }}>
                지금 이 순간 <span className="nk-num" style={{ color: "var(--navy-800)", fontWeight: 800 }}>13,404</span>건 분석 가능
              </span>
            </div>
          </div>
        </div>

        <div className="nk-reveal" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", background: "#fff" }}>
          {big.map((b, i) => (
            <div key={i} style={{ padding: "36px 32px 32px", borderRight: i < 3 ? "1px solid var(--border)" : "none", position: "relative", background: i % 2 === 0 ? "#fff" : "#FCFDFE" }}>
              <div className="nk-eyebrow nk-en" style={{ color: "var(--fg-4)", marginBottom: 18, letterSpacing: "0.14em", fontSize: 10 }}>{String(i + 1).padStart(2, "0")} / 04</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 14 }}>
                <span className="nk-num" style={{ fontSize: "clamp(40px, 4.4vw, 60px)", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.035em", color: "var(--navy-800)" }}>{b.n}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--fg-3)" }}>{b.u}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)", marginBottom: 6, letterSpacing: "-0.01em" }}>{b.l}</div>
              <div style={{ fontSize: 13, color: "var(--fg-3)", lineHeight: 1.5 }}>{b.d}</div>
            </div>
          ))}
        </div>

        <div className="nk-reveal" style={{ marginTop: 28, display: "flex", justifyContent: "center", alignItems: "center", gap: 32, fontSize: 13, color: "var(--fg-3)", flexWrap: "wrap" }}>
          <span><span className="nk-num" style={{ color: "var(--navy-800)", fontWeight: 800 }}>2002년</span>부터 누적</span>
          <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--border)" }} />
          <span>나라장터 공식 데이터</span>
          <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--border)" }} />
          <span>매일 자동 갱신</span>
        </div>
      </div>
    </section>
  );
}

function ProvenPerformance() {
  const stats = [
    { pre: "약 ", n: "30", u: "%", l: "낙찰선 ±3등 근접률", d: "추천가가 낙찰선 코앞(±3등)에 안착하는 비율" },
    { pre: "", n: "28,000", u: "+", l: "맞춤 학습 발주처", d: "발주처마다 다른 입찰 패턴을 각각 학습" },
    { pre: "", n: "5,300", u: "만+", l: "분석 기반 데이터", d: "2002년부터 쌓인 공고·낙찰·개찰 전 기록 위에서 예측" },
  ];
  return (
    <section style={{ background: "var(--navy-900)", color: "#fff", padding: "140px 0", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(96,165,250,0.06) 1px, transparent 1px)", backgroundSize: "30px 30px", maskImage: "linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)", WebkitMaskImage: "linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)" }} />
      <div className="nk-container" style={{ position: "relative" }}>
        <div className="nk-reveal" style={{ maxWidth: 760, marginBottom: 56 }}>
          <div className="nk-eyebrow" style={{ color: "var(--blue-400)", marginBottom: 16 }}>PROVEN PERFORMANCE</div>
          <h2 style={{ fontSize: "clamp(34px, 4vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.028em", fontWeight: 900, margin: "0 0 16px", color: "#fff" }}>
            숫자로 증명합니다.
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(255,255,255,0.65)", margin: 0 }}>
            감이 아니라, 검증된 숫자입니다.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          {stats.map((s, i) => (
            <div key={i} className="nk-reveal" style={{ padding: "40px 32px 36px", borderRight: i < 2 ? "1px solid rgba(255,255,255,0.12)" : "none" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 18 }}>
                {s.pre && <span className="nk-num nk-en" style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 700, color: "var(--blue-400)", marginRight: 2 }}>{s.pre}</span>}
                <span className="nk-num nk-en" style={{ fontSize: "clamp(48px, 6vw, 76px)", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.04em", color: "#fff" }}>{s.n}</span>
                <span style={{ fontSize: "clamp(18px, 2vw, 24px)", fontWeight: 700, color: "var(--blue-400)", marginLeft: 2 }}>{s.u}</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 8, letterSpacing: "-0.01em" }}>{s.l}</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{s.d}</div>
            </div>
          ))}
        </div>

        <div className="nk-reveal" style={{ marginTop: 26, fontSize: 12.5, color: "rgba(255,255,255,0.42)", lineHeight: 1.6 }}>
          * 낙찰선 ±3등 근접률은 자체 백테스트(2024~2026년, 27만 공고) 기준이며, 낙찰을 보장하지 않습니다.
        </div>
      </div>
    </section>
  );
}

function Flow() {
  const steps = [
    { n: "01", t: "공고 검색", d: "업종, 지역, 계약 방법으로 즉시 필터. 활성 공고를 한 번에 훑습니다.", sub: "SEARCH", viz: "filter" },
    { n: "02", t: "AI 분석", d: "사정율 · 투찰가 · 번호 조합 · 자격까지 한 번에 산출.", sub: "ANALYZE", viz: "curve" },
    { n: "03", t: "결과 추적", d: "낙찰 여부가 자동으로 기록됩니다. 다음 입찰을 위한 자산입니다.", sub: "TRACK", viz: "spark" },
  ];
  return (
    <section id="flow" style={{ background: "#fff", padding: "120px 0", borderTop: "1px solid var(--border)" }}>
      <div className="nk-container">
        <div className="nk-reveal" style={{ marginBottom: 64, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 560 }}>
            <div className="nk-eyebrow" style={{ color: "var(--navy-800)", marginBottom: 16 }}>THE FLOW</div>
            <h2 style={{ fontSize: "clamp(34px, 4vw, 52px)", lineHeight: 1.08, letterSpacing: "-0.028em", fontWeight: 900, margin: 0 }}>
              공고에서 자산까지,<br />세 단계.
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--fg-4)" }}>
            <div style={{ width: 32, height: 1, background: "var(--border)" }} />
            <span className="nk-en nk-num" style={{ fontSize: 12, letterSpacing: "0.1em", fontWeight: 700 }}>03 STAGES</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, position: "relative" }}>
          <div style={{ position: "absolute", top: 54, left: "12%", right: "12%", height: 1, background: "repeating-linear-gradient(90deg, var(--border) 0, var(--border) 6px, transparent 6px, transparent 12px)" }} />
          {steps.map((s, i) => (
            <div key={i} className="nk-reveal" style={{ padding: "0 24px", position: "relative", zIndex: 1 }}>
              <div style={{ width: 108, height: 108, borderRadius: 999, background: "#fff", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(15,30,60,0.04)", display: "grid", placeItems: "center", margin: "0 0 28px", position: "relative" }}>
                <div style={{ position: "absolute", inset: 8, borderRadius: 999, background: "var(--cell)", display: "grid", placeItems: "center" }}>
                  <span className="nk-en nk-num" style={{ fontSize: 32, fontWeight: 900, color: "var(--navy-800)", letterSpacing: "-0.04em" }}>{s.n}</span>
                </div>
              </div>
              <div className="nk-eyebrow nk-en" style={{ color: "var(--blue-400)", marginBottom: 10, letterSpacing: "0.18em", fontWeight: 800 }}>{s.sub}</div>
              <h3 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.024em", margin: "0 0 12px" }}>{s.t}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--fg-3)", margin: "0 0 22px", maxWidth: 320 }}>{s.d}</p>
              {s.viz === "filter" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["건설", "용역", "물품", "대전", "수의", "지역제한"].map((c, j) => (
                    <span key={j} style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: j < 2 ? "var(--navy-800)" : "#F8FAFC", color: j < 2 ? "#fff" : "var(--fg-3)", border: j < 2 ? "1px solid var(--navy-800)" : "1px solid var(--border)" }}>{c}</span>
                  ))}
                </div>
              )}
              {s.viz === "curve" && (
                <div style={{ padding: 16, background: "var(--cell)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <Sparkline color="#1B3A6B" stroke={2} seed={9} height={48} />
                </div>
              )}
              {s.viz === "spark" && (
                <div style={{ padding: 16, background: "var(--cell)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <Sparkline color="#059669" stroke={2} seed={31} height={48} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    { label: "PUBLIC DATA", t: "공식 조달 데이터", d: "조달청 나라장터 공식 데이터를 기반으로 분석합니다." },
    { label: "COVERAGE", t: "활성 공고 전수", d: "활성 공고 전수를 분석합니다. 검색 한 번이면 충분합니다." },
    { label: "NO FEE", t: "낙찰 수수료 0원", d: "낙찰해도 떼가는 돈이 없습니다. 공고 검색·박스권은 무료, 정밀 추천은 월 3건 무료로 시작합니다." },
  ];
  return (
    <section id="trust" style={{ background: "var(--page)", padding: "120px 0" }}>
      <div className="nk-container">
        <div className="nk-reveal" style={{ marginBottom: 48, maxWidth: 680 }}>
          <div className="nk-eyebrow" style={{ color: "var(--navy-800)", marginBottom: 16 }}>FOUNDATION</div>
          <h2 style={{ fontSize: "clamp(32px, 3.6vw, 46px)", lineHeight: 1.1, letterSpacing: "-0.028em", fontWeight: 900, margin: 0 }}>
            신뢰는 데이터의 출처에서 시작됩니다.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {items.map((it, i) => (
            <div key={i} className="nk-reveal nk-feat" style={{ padding: "32px 28px" }}>
              <div className="nk-eyebrow nk-en" style={{ color: "var(--blue-400)", marginBottom: 18, letterSpacing: "0.16em", fontWeight: 800 }}>{it.label}</div>
              <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.022em", margin: "0 0 12px" }}>{it.t}</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--fg-3)", margin: 0 }}>{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 어도비식 펼쳐지는 전체 기능 비교표 (2026-07-09 박상빈님 지시)
function PricingCompareTable() {
  const [open, setOpen] = useState(false);
  const TIERS = ["무료", "라이트", "프로", "비즈", "마스터"];
  const ROWS: { group?: string; name: string; vals: string[] }[] = [
    { group: "기본", name: "공고 검색·상세 열람", vals: ["✓", "✓", "✓", "✓", "✓"] },
    { name: "사정율 박스권(범위)", vals: ["✓", "✓", "✓", "✓", "✓"] },
    { name: "개찰 후 성적표 알림", vals: ["✓", "✓", "✓", "✓", "✓"] },
    { group: "AI 분석", name: "공고 AI 분석 (정밀 투찰가·번호)", vals: ["월 3건", "무제한", "무제한", "무제한", "무제한"] },
    { name: "AI 원본값 (개인화 보정 0)", vals: ["—", "—", "✓", "✓", "✓"] },
    { name: "실시간 참여자 모니터", vals: ["—", "—", "✓", "✓", "✓"] },
    { name: "경쟁사·발주처 심층 분석", vals: ["—", "—", "✓", "✓", "✓"] },
    { name: "사정율 추세·안정성 분석", vals: ["—", "✓", "✓", "✓", "✓"] },
    { group: "알림", name: "공고 조건 알림", vals: ["3개", "10개", "무제한", "무제한", "무제한"] },
    { name: "카카오 알림톡", vals: ["—", "✓", "✓", "✓", "✓"] },
    { name: "경쟁사 추적 (낙찰 알림)", vals: ["1개사", "3개사", "5개사", "10개사", "무제한"] },
    { group: "리포트", name: "주간 리포트", vals: ["기본", "기본", "기본", "심층", "심층"] },
    { name: "월간 맞춤 백테스트", vals: ["—", "—", "—", "—", "✓"] },
    { group: "기타", name: "팀 계정 (8월 오픈)", vals: ["1", "1", "1", "3", "5"] },
    { name: "광고", vals: ["노출", "제거", "제거", "제거", "제거"] },
    { name: "낙찰 수수료", vals: ["0원", "0원", "0원", "0원", "0원"] },
    { name: "월 요금 (연납 시 2개월 무료)", vals: ["0원", "9,900원", "19,900원", "49,900원", "99,000원"] },
  ];
  return (
    <div className="nk-reveal" style={{ marginTop: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", height: 50, borderRadius: 12, cursor: "pointer",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        전체 기능 비교 {open ? "접기 ▴" : "펼쳐보기 ▾"}
      </button>
      {open && (
        <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.06)" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", color: "rgba(255,255,255,0.6)", fontWeight: 600, fontSize: 11.5 }}>기능</th>
                {TIERS.map((t, i) => (
                  <th key={t} style={{ padding: "12px 8px", color: i === 2 ? "var(--blue-300)" : "rgba(255,255,255,0.85)", fontWeight: 800, whiteSpace: "nowrap" }}>
                    {t}{i === 2 ? " ⭐" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <Fragment key={r.name}>
                  {r.group && (
                    <tr>
                      <td colSpan={6} style={{ padding: "10px 16px 4px", color: "var(--blue-400)", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{r.group}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "9px 16px", color: "rgba(255,255,255,0.75)" }}>{r.name}</td>
                    {r.vals.map((v, i) => (
                      <td key={i} style={{
                        padding: "9px 8px", textAlign: "center", whiteSpace: "nowrap",
                        color: v === "—" ? "rgba(255,255,255,0.25)" : v === "✓" ? "var(--green-400)" : "#fff",
                        fontWeight: v === "✓" || v === "—" ? 400 : 600,
                        background: i === 2 ? "rgba(96,165,250,0.06)" : "transparent",
                      }}>{v}</td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pricing() {
  return (
    <section style={{ background: "var(--navy-900)", color: "#fff", padding: "140px 0", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(96,165,250,0.06) 1px, transparent 1px)", backgroundSize: "30px 30px", maskImage: "linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)", WebkitMaskImage: "linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)" }} />
      <div className="nk-container" style={{ position: "relative" }}>
        <div className="nk-reveal" style={{ maxWidth: 880, marginBottom: 64 }}>
          <div className="nk-eyebrow" style={{ color: "var(--blue-400)", marginBottom: 18 }}>PRICING</div>
          <h2 style={{ fontSize: "clamp(40px, 5.4vw, 72px)", lineHeight: 1.04, letterSpacing: "-0.032em", fontWeight: 900, margin: "0 0 22px", color: "#fff" }}>
            낙찰 수수료 <span style={{ color: "var(--blue-400)" }}>0원</span>.<br />무료로 시작하세요.
          </h2>
          <p style={{ fontSize: "clamp(16px, 1.4vw, 19px)", lineHeight: 1.6, color: "rgba(255,255,255,0.65)", margin: 0, maxWidth: 560 }}>
            낙찰해도 떼가는 돈이 없습니다. 공고 검색과 사정율 박스권은 무료 — 정밀 추천이 필요할 때만 구독하세요.
          </p>
        </div>

        <div className="nk-reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            { label: "무료", price: "0원", detail: "공고 검색 · 박스권 · AI 분석 월 3건", hot: false },
            { label: "라이트", price: "9,900원", detail: "공고 AI 분석 무제한 · 광고 제거", hot: false },
            { label: "프로", price: "19,900원", detail: "AI 원본값 · 실시간 모니터", hot: true },
            { label: "비즈", price: "49,900원", detail: "팀 3계정 · 주간 심층 리포트", hot: false },
            { label: "마스터", price: "99,000원", detail: "5계정 · 맞춤 백테스트 · 전담", hot: false },
          ].map((p, i) => (
            <div key={i} style={{
              padding: "26px 20px", borderRadius: 18,
              background: p.hot ? "linear-gradient(180deg, rgba(96,165,250,0.16) 0%, rgba(96,165,250,0.04) 100%)" : "rgba(255,255,255,0.035)",
              border: "1px solid " + (p.hot ? "rgba(96,165,250,0.32)" : "rgba(255,255,255,0.1)"),
              position: "relative",
            }}>
              {p.hot && <div style={{ position: "absolute", top: -11, left: 20, background: "var(--blue-400)", color: "#0F1E3C", fontSize: 10.5, fontWeight: 800, padding: "3px 10px", borderRadius: 99 }}>가장 인기</div>}
              <div style={{ fontSize: 13, fontWeight: 700, color: p.hot ? "var(--blue-300)" : "rgba(255,255,255,0.75)", marginBottom: 12 }}>{p.label}</div>
              <div className="nk-num" style={{ fontSize: "clamp(22px, 2.2vw, 28px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.03em", marginBottom: 10 }}>
                {p.price}<span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", marginLeft: 3 }}>{i === 0 ? "" : "/월"}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{p.detail}</div>
            </div>
          ))}
        </div>

        <PricingCompareTable />

        <div className="nk-reveal" style={{ marginTop: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 32, flexWrap: "wrap", padding: "24px 32px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {[["낙찰 수수료", "0원"], ["연간 결제", "2개월 무료"], ["초기 구독자", "가격 평생 고정"]].map(([k, v], i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 32 }}>
              {i > 0 && <span style={{ width: 1, height: 32, background: "rgba(255,255,255,0.1)" }} />}
              <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{k}</span>
                <span className="nk-num" style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>{v}</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    { q: "어떤 입찰 방식을 지원하나요?", a: "복수예가, 적격심사 등 일반 공공입찰 전 영역을 지원합니다. 시설공사 · 용역 · 물품 모두 분석 대상입니다." },
    { q: "낙찰이 보장되나요?", a: "낙찰을 보장하지 않습니다. AI는 통계적 확률을 높이는 도구이며, 최종 의사결정은 항상 사용자에게 있습니다." },
    { q: "데이터는 어디서 가져오나요?", a: "조달청 나라장터 공식 데이터를 사용합니다. 다른 출처는 사용하지 않습니다." },
    { q: "요금은 어떻게 되나요?", a: "낙찰 수수료는 0원입니다 — 낙찰해도 떼가는 돈이 없습니다. 공고 검색·사정율 박스권은 무료이고, 정밀 투찰가 추천은 무료 월 3건 후 구독(라이트 9,900원/프로 19,900원~)으로 무제한 이용할 수 있습니다. 연간 결제 시 2개월 무료." },
  ];
  return (
    <section id="faq" style={{ background: "var(--page)", padding: "120px 0" }}>
      <div className="nk-container" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.7fr) 1.6fr", gap: 80, alignItems: "start" }}>
        <div className="nk-reveal" style={{ position: "sticky", top: 90 }}>
          <div className="nk-eyebrow" style={{ color: "var(--navy-800)", marginBottom: 16 }}>QUESTIONS</div>
          <h2 style={{ fontSize: "clamp(32px, 3.6vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.028em", fontWeight: 900, margin: 0 }}>
            자주 묻는 것들.
          </h2>
        </div>
        <div className="nk-reveal">
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {items.map((it, i) => (
              <details key={i} className="nk-faq" {...(i === 0 ? { open: true } : {})}>
                <summary>
                  <span className="nk-q">{it.q}</span>
                  <span className="nk-plus">+</span>
                </summary>
                <div className="nk-a">{it.a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section id="cta" style={{ background: "var(--navy-900)", color: "#fff", padding: "140px 0", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 600px 400px at 50% 50%, rgba(96,165,250,0.12), transparent 70%)" }} />
      <div className="nk-container" style={{ position: "relative", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(48px, 7vw, 92px)", lineHeight: 1.05, letterSpacing: "-0.038em", fontWeight: 900, margin: "0 0 56px", color: "#fff" }}>
          공고를 여는 순간,<br />
          <span style={{ color: "var(--blue-400)" }}>투찰가가 나옵니다.</span>
        </h2>
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Link href="/signup" className="nk-cta-onDark" style={{ height: 64, padding: "0 44px", fontSize: 18, borderRadius: 14 }}>
            무료로 시작하기 <span aria-hidden>→</span>
          </Link>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>낙찰 수수료 0원 · 카드 등록 없이 가입</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const company: [string, string][] = [
    ["상호명", "주식회사 호라이즌"],
    ["대표자", "박상빈"],
    ["사업자등록번호", "398-87-03453"],
    ["주소", "대전광역시 유성구 장대로 106, 2층 제이321호"],
    ["전화", "0505-007-9882"],
  ];
  // 4 컬럼 정책·서비스 링크
  const linkGroups: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: "서비스",
      links: [
        { label: "엔진 소개", href: "#engines" },
        { label: "분석 프로세스", href: "#flow" },
        { label: "신뢰성", href: "#trust" },
        { label: "FAQ", href: "/faq" },
      ],
    },
    {
      title: "요금·정책",
      links: [
        { label: "이용 요금", href: "/pricing" },
        { label: "환불 정책", href: "/refund" },
      ],
    },
    {
      title: "법적 고지",
      links: [
        { label: "이용약관", href: "/terms" },
        { label: "개인정보처리방침", href: "/privacy" },
      ],
    },
    {
      title: "고객지원",
      links: [
        { label: "💬 카카오톡 채널", href: "http://pf.kakao.com/_SQxmKX" },
        { label: "1:1 채팅 문의", href: "http://pf.kakao.com/_SQxmKX/chat" },
      ],
    },
  ];
  return (
    <footer style={{ background: "#0A1428", color: "rgba(255,255,255,0.5)", padding: "64px 0 40px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="nk-container">
        {/* 상단: 회사 정보 + 4 컬럼 링크 */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", gap: 36, paddingBottom: 36, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--navy-800)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 14, letterSpacing: "-0.04em" }}>낙</div>
              <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.1 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>낙비</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>내 손안의 AI 낙찰비서</span>
              </span>
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "rgba(255,255,255,0.55)", margin: "0 0 10px", maxWidth: 320 }}>
              공공입찰, 데이터로 답한다.
            </p>
            <p style={{ fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.38)", margin: 0, maxWidth: 320 }}>
              AI 분석 결과는 참고용이며 낙찰을 보장하지 않습니다.
            </p>
          </div>
          {linkGroups.map((group) => (
            <div key={group.title}>
              <div className="nk-eyebrow" style={{ color: "rgba(255,255,255,0.5)", marginBottom: 14, letterSpacing: "0.14em", fontSize: 11, fontWeight: 700 }}>
                {group.title}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      style={{
                        fontSize: 13, color: "rgba(255,255,255,0.78)",
                        textDecoration: "none", fontWeight: 500,
                        transition: "color 0.15s",
                      }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 회사 정보 (작은 글씨) */}
        <div style={{ padding: "24px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            {company.map(([k, v]) => (
              <span key={k}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}: </span>
                <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{v}</span>
              </span>
            ))}
          </div>
        </div>

        {/* 저작권 */}
        <div style={{ paddingTop: 20, fontSize: 11.5, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          © 2026 낙비 · 주식회사 호라이즌. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ── Root ────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 40);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useReveal();

  return (
    <div style={{ background: "var(--page)", color: "var(--fg-1)", fontFamily: "'Pretendard', -apple-system, 'Apple SD Gothic Neo', BlinkMacSystemFont, sans-serif", overflowX: "hidden" }}>
      <style>{styles}</style>
      <Nav scrolled={scrolled} />
      <Hero />
      <ProblemSection />
      <Engines />
      <WhyAccurate />
      <DataScale />
      <ProvenPerformance />
      <Flow />
      <Trust />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
