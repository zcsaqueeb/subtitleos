import logoUrl from "@/assets/logo.png";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard, FileText, Shield, LogOut, Wand2, Menu, X,
  UserCircle2, FileArchive, Mic, Users, FileVideo, Sparkles,
  Volume2, Flame, Plug, Film, Clapperboard,
} from "lucide-react";
import { supabase } from "@/lib/supabase-safe";
import { getCurrentUserContext } from "@/lib/user.functions";
import { getUnreadContactCount } from "@/lib/admin.functions";
import { ThemeSwitcher, ThemeBootstrap } from "@/components/theme-switcher";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";


export function AppShell({ children }: { children?: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchState = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const [open, setOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);


  const fetchCtx = useServerFn(getCurrentUserContext);
  const { data: ctx } = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchCtx(),
    staleTime: 60_000,
    enabled: hasSession,
    retry: false,
  });

  const isAdmin = ctx?.roles?.includes("admin") ?? false;

  const fetchUnread = useServerFn(getUnreadContactCount);
  const { data: unreadData } = useQuery({
    queryKey: ["admin", "unread-contact"],
    queryFn: () => fetchUnread(),
    enabled: isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadContact = unreadData?.unread ?? 0;

  // Sign-in has been removed from the app: everything is open to everyone.


  const navSections = [
    {
      label: "Translator",
      items: [
        { to: "/app", label: "Translator", icon: Wand2 },
        { to: "/transcribe", label: "Transcribe (video/audio)", icon: Mic },
        { to: "/batch", label: "Translator batch zip", icon: FileArchive },
      ],
    },
    {
      label: "AI Summaries",
      items: [
        { to: "/summarize", label: "AI Video Summary", icon: FileVideo, search: { mode: "video" as const } },
        { to: "/summarize", label: "AI Audio Summary", icon: Sparkles, search: { mode: "audio" as const } },
      ],
    },
    {
      label: "AI Studio",
      items: [
        { to: "/dub", label: "Voice Dubbing", icon: Volume2 },
        { to: "/dub/movie", label: "Movie Dubbing", icon: Film },
        { to: "/dub/projects", label: "Multi-Character Studio", icon: Users },
        { to: "/burn", label: "Burn Subtitles into Video", icon: Flame },
        { to: "/editor", label: "Video Editor", icon: Clapperboard },
      ],
    },
    {
      label: "Workspace",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/history", label: "History", icon: FileText },
        { to: "/team", label: "Team workspaces", icon: Users },
      ],
    },
    {
      label: "Settings",
      items: [
        
        { to: "/connectors", label: "Connectors", icon: Plug },
      ],
    },
    ...(isAdmin
      ? [{ label: "Admin", items: [{ to: "/admin", label: "Admin", icon: Shield }] }]
      : []),
  ] as const;


  const navigation = (
    <nav aria-label="Studio navigation" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 pb-3">
      {navSections.map((section) => (
        <div key={section.label} className="space-y-1">
          <div className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{section.label}</div>
          {section.items.map((item) => {
            const itemSearch = (item as { search?: Record<string, string> }).search;
            const active = pathname === item.to && (!itemSearch || Object.entries(itemSearch).every(([k, v]) => searchState?.[k] === v));
            return (
              <Link key={`${item.to}:${item.label}`} to={item.to} search={itemSearch as any}
                preload="intent"
                onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                className={`flex min-h-12 min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 md:py-2.5 ${active ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-accent"}`}>
                <item.icon className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                <span className="min-w-0 flex-1 break-words">{item.label}</span>
                {item.to === "/admin" && unreadContact > 0 && <span className="shrink-0 text-xs text-gold">{unreadContact > 99 ? "99+" : unreadContact}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="app-shell relative min-h-dvh bg-background text-foreground">
      <a href="#studio-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground focus:ring-2 focus:ring-ring">Skip to workspace</a>
      <ThemeBootstrap />

      {/* top bar */}
      <header className="app-header sticky top-0 z-40 border-b border-border bg-background md:bg-background/70 md:backdrop-blur">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 md:h-14 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-12 shrink-0 md:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" aria-describedby={undefined} className="mobile-menu flex h-dvh w-[min(20rem,calc(100vw-2rem))] flex-col gap-5 p-4 data-[state=open]:animate-none data-[state=closed]:animate-none">
                <SheetTitle className="flex min-h-11 items-center pr-14">SubtitleOS</SheetTitle>
                {navigation}
              </SheetContent>
            </Sheet>
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <img src={logoUrl} alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg" />
<span className="truncate font-display text-lg">SubtitleOS</span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <div className="app-layout mx-auto flex max-w-7xl gap-6 px-3 py-4 md:px-4 md:py-6">
        {/* sidebar */}
        <aside className="hidden md:sticky md:top-20 md:block md:h-[calc(100dvh-6rem)] md:w-56 md:shrink-0 md:self-start md:overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            {navigation}
          </div>
        </aside>

        {/* content */}
        <main id="studio-content" className="min-w-0 flex-1">{children ?? <Outlet />}</main>
      </div>

    </div>
  );
}

export { LayoutDashboard }; // re-export to avoid unused
