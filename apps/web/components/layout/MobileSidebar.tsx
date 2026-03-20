"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import type { Plan } from "@naktal/types";

interface MobileSidebarProps {
  plan?: Plan;
}

export function MobileSidebar({ plan }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-md hover:bg-gray-100 focus:outline-none"
            aria-label="메뉴 열기"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        }
      />
      <SheetContent side="left" className="p-0 w-64">
        <Sidebar plan={plan} />
      </SheetContent>
    </Sheet>
  );
}
