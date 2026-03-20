"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface HeaderProps {
  title: string;
  email?: string;
}

export function Header({ title, email }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = email ? email.charAt(0).toUpperCase() : "U";

  return (
    <header className="flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
      <h1 className="text-lg font-semibold text-gray-800">{title}</h1>

      <div className="flex items-center gap-3">
        {email && (
          <span className="text-sm text-gray-600 hidden sm:block">{email}</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex items-center gap-2 focus:outline-none rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#1E3A5F] text-white text-xs">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </button>
            }
          />
          <DropdownMenuContent align="end">
            {email && (
              <DropdownMenuItem className="text-sm text-gray-600 cursor-default sm:hidden">
                {email}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 cursor-pointer"
            >
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="hidden sm:flex"
        >
          로그아웃
        </Button>
      </div>
    </header>
  );
}
