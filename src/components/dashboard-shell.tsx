"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  Command,
  FileText,
  Globe2,
  LayoutDashboard,
  Menu,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";

const navigation: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Markets", href: "/markets", icon: Globe2 },
  { label: "Economic calendar", href: "/calendar", icon: CalendarDays },
  { label: "News sentiment", href: "/sentiment", icon: Activity },
  { label: "Model insights", href: "/model", icon: BarChart3 },
  { label: "Research reports", href: "/reports", icon: FileText },
];

function NavigationLink({
  item,
  active,
  onClick,
}: {
  item: (typeof navigation)[number];
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      onClick={onClick}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group flex h-[36px] items-center gap-[11px] rounded-md px-[10px] text-[11px] transition-colors",
        active
          ? "bg-[#c5f36a12] text-[#c5f36a]"
          : "text-[#858b96] hover:bg-white/[.035] hover:text-[#deded9]",
      )}
    >
      <Icon size={15} strokeWidth={1.7} />
      {item.label}
    </Link>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const title = navigation.find((item) => item.href === pathname)?.label ?? "Overview";
  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    return query
      ? navigation.filter((item) => `${item.label} ${item.href}`.toLocaleLowerCase().includes(query))
      : navigation;
  }, [searchTerm]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0f12]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[218px] flex-col border-r border-[#23262b] bg-[#101215] lg:flex">
        <Link href="/" className="flex h-[61px] items-center gap-2.5 border-b border-[#23262b] px-[19px]">
          <span className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-[#c5f36a] text-[#161a12]"><Activity size={16} strokeWidth={2.4} /></span>
          <span className="text-[13px] font-semibold tracking-[-.035em] text-[#efeee9]">Macro<span className="text-[#c5f36a]">Pulse</span><span className="ml-[5px] font-normal text-[#777d86]">AI</span></span>
        </Link>
        <div className="flex-1 overflow-y-auto px-[11px] pt-[20px]">
          <p className="mb-[8px] px-[10px] text-[9px] font-semibold uppercase tracking-[.13em] text-[#626873]">Workspace</p>
          <nav aria-label="Main navigation" className="space-y-[2px]">{navigation.map((item) => <NavigationLink key={item.href} item={item} active={pathname === item.href} />)}</nav>
          <div className="my-[18px] border-t border-[#24272c]" />
          <p className="mb-[8px] px-[10px] text-[9px] font-semibold uppercase tracking-[.13em] text-[#626873]">Data</p>
          <Link href="/reports" className="flex h-[35px] items-center gap-[10px] rounded px-[10px] text-[11px] text-[#838994] hover:bg-white/[.035] hover:text-[#ddd]">
            <FileText size={14} /> Source reports &amp; API status
          </Link>
          <div className="mt-[22px] rounded-[8px] border border-[#2d3035] bg-[#15171b] p-[11px]">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#d3d2cb]"><Globe2 size={12} className="text-[#c5f36a]" /> Local API</div>
            <p className="mt-2 text-[10px] leading-[1.75] text-[#858993]">Pages show data returned by the configured backend. Missing sources stay empty.</p>
            <Link href="/reports" className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#c5f36a]">View coverage <span>→</span></Link>
          </div>
        </div>
        <div className="border-t border-[#24272c] p-[12px]"><div className="flex items-center gap-[10px] rounded-md px-1.5 py-1.5"><span className="flex h-[27px] w-[27px] items-center justify-center rounded-full border border-[#41444a] bg-[#24272d] text-[10px] text-[#d6d4ce]">MP</span><span className="min-w-0 flex-1"><span className="block text-[10px] text-[#d1d0ca]">MacroPulse AI</span><span className="mt-0.5 block text-[9px] text-[#747a84]">Local workspace</span></span></div></div>
      </aside>

      {menuOpen && <div className="fixed inset-0 z-50 bg-black/60 lg:hidden">
        <aside className="relative z-10 flex h-full w-[min(285px,85vw)] flex-col border-r border-[#282c31] bg-[#101215]">
          <div className="flex items-center justify-between border-b border-[#25292e] px-4 py-4">
            <Link href="/" className="flex items-center gap-2 text-[13px] font-semibold" onClick={() => setMenuOpen(false)}><Activity size={17} className="text-[#c5f36a]" />MacroPulse <span className="text-[#c5f36a]">AI</span></Link>
            <button type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="p-1 text-[#979ba3]"><X size={18} /></button>
          </div>
          <nav aria-label="Mobile navigation" className="space-y-1 px-3 py-4">{navigation.map((item) => <NavigationLink key={item.href} item={item} active={pathname === item.href} onClick={() => setMenuOpen(false)} />)}</nav>
        </aside>
        <button type="button" aria-label="Close navigation overlay" className="absolute inset-0 h-full w-full" onClick={() => setMenuOpen(false)} />
      </div>}

      <div className="min-h-screen lg:pl-[218px]">
        <header className="sticky top-0 z-20 flex h-[61px] items-center justify-between border-b border-[#23262b] bg-[#0d0f12]/95 px-4 backdrop-blur-md sm:px-6 lg:px-[29px]">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)} className="rounded p-1 text-[#999ea7] hover:text-white lg:hidden"><Menu size={18} /></button>
            <span className="hidden text-[11px] text-[#777d86] sm:inline">Workspace</span><span className="hidden text-[11px] text-[#4d525b] sm:inline">/</span><span className="truncate text-[11px] text-[#d5d4cf]">{title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" aria-label="Search pages" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)} className="flex h-[30px] items-center gap-2 rounded border border-[#292d32] bg-[#13161a] px-2 text-[10px] text-[#858b95] hover:text-[#ddd]"><Search size={13} /><span className="hidden md:block">Search pages</span><span className="hidden items-center gap-0.5 rounded border border-[#363940] px-1 py-0.5 text-[8px] md:inline-flex"><Command size={9} /> K</span></button>
            <button type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => !open); setSearchOpen(false); }} className="relative flex h-[30px] w-[30px] items-center justify-center rounded border border-[#292d32] bg-[#13161a] text-[#898f99] hover:text-[#ddd]"><Bell size={14} /></button>
          </div>
          {searchOpen && <div role="dialog" aria-label="Search pages" className="absolute right-4 top-[49px] w-[min(360px,calc(100vw-32px))] rounded-lg border border-[#30343a] bg-[#15181d] p-3 shadow-xl">
            <label className="flex items-center gap-2 rounded border border-[#30343a] bg-[#0f1115] px-3 py-2"><Search size={14} className="text-[#818791]" /><input autoFocus aria-label="Search page routes" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search pages…" className="w-full bg-transparent text-[11px] text-[#eae9e4] outline-none placeholder:text-[#727780]" /><button type="button" onClick={() => { setSearchOpen(false); setSearchTerm(""); }} className="text-[9px] text-[#777d85]">ESC</button></label>
            <nav aria-label="Search results" className="mt-2 max-h-[260px] overflow-auto">{searchResults.length ? searchResults.map((item) => <NavigationLink key={item.href} item={item} active={pathname === item.href} onClick={() => { setSearchOpen(false); setSearchTerm(""); }} />) : <p role="status" className="px-2 py-3 text-[10px] text-[#858b94]">No pages match “{searchTerm}”.</p>}</nav>
          </div>}
          {notificationsOpen && <div role="status" className="absolute right-4 top-[49px] w-[min(300px,calc(100vw-32px))] rounded-lg border border-[#30343a] bg-[#15181d] p-4 shadow-xl"><p className="text-[11px] font-medium text-[#deddd8]">Notifications</p><p className="mt-2 text-[10px] leading-[1.7] text-[#898f98]">The connected API does not provide notifications.</p></div>}
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-[25px] sm:px-6 sm:pt-[30px] lg:px-[30px] xl:px-[38px]">{children}</main>
        <footer className="mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#23262b] py-4 text-[9px] text-[#696f79] sm:mx-6 lg:mx-[30px] xl:mx-[38px]">
          <span>MacroPulse AI <span className="px-1 text-[#41464d]">·</span> Local API data <span className="px-1 text-[#41464d]">·</span> Source values only</span>
          <Link href="/reports" className="hover:text-[#bfc0bb]">Data coverage &amp; limitations →</Link>
        </footer>
      </div>
    </div>
  );
}
