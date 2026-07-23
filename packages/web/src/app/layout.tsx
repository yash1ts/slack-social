import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "slack-social",
  description: "Local Instagram-style feed for public Slack activity",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full overflow-hidden">
      <body className="h-full overflow-hidden antialiased">{children}</body>
    </html>
  );
}
