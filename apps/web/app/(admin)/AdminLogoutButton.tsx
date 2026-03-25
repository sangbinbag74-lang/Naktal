"use client";

export function AdminLogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/admin-login", { method: "DELETE" });
    window.location.href = "/admin-login";
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        fontSize: 12, color: "rgba(248,113,113,0.7)",
        background: "none", border: "none", cursor: "pointer",
        textAlign: "left", padding: 0,
      }}
    >
      로그아웃
    </button>
  );
}
