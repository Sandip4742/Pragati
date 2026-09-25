import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SchoolConnect",
  referrer: "no-referrer",
  description: "Your school, connected. A shared workspace for school admins, teachers and parents.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
