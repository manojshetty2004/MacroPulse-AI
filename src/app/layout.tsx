import type { Metadata } from "next";
import "./globals.css";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  title: "MacroPulse AI — Macro Intelligence, Clearly in Focus",
  description: "A clear, considered view of the macroeconomic signals shaping global markets. Preview dashboard uses labeled demonstration data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DashboardShell>{children}</DashboardShell></body></html>;
}
