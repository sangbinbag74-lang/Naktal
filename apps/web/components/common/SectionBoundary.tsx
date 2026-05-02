"use client";

import * as React from "react";

interface State {
  err: Error | null;
}

interface Props {
  title?: string;
  children: React.ReactNode;
}

/** G-6: 섹션별 에러 격리. 한 섹션이 실패해도 나머지 페이지는 그대로 렌더링. */
export class SectionBoundary extends React.Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    console.error("[SectionBoundary]", this.props.title ?? "", err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ background: "#FEF2F2", borderRadius: 12, border: "1px solid #FCA5A5", padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>
            {this.props.title ? `${this.props.title} 섹션 표시 실패` : "섹션 표시 실패"}
          </div>
          <div style={{ fontSize: 11, color: "#7F1D1D" }}>{this.state.err.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
