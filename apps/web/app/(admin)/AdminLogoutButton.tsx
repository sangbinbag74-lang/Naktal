"use client";

export function AdminLogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/admin-login", { method: "DELETE" });
    window.location.href = "/admin-login";
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 text-xs text-red-400/70 hover:text-red-400 transition-colors w-full text-left"
    >
      로그아웃
    </button>
  );
}
