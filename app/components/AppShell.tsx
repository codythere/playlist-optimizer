'use client';

import * as React from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/app/components/ui/sheet";
import { Button } from "@/app/components/ui/button";
import { Sidebar } from "@/app/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="flex min-h-screen bg-background">
        <aside className="hidden w-64 border-r bg-muted/40 p-4 md:block">
          <Sidebar />
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3">
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle navigation</span>
                </Button>
              </SheetTrigger>
              <div className="text-lg font-semibold">yt-playlist-manager</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-muted" aria-hidden />
            </div>
          </header>
          <main className="flex flex-1 flex-col overflow-y-auto bg-background px-4 py-6 sm:px-8">
            {children}
          </main>
        </div>
      </div>
      <SheetContent side="left" className="w-72 p-0">
        <Sidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}