import type { Metadata } from "next";
import "./globals.css";
import { validateRequiredEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Chief of Staff",
  description: "Your calm, trustworthy daily brief",
};

validateRequiredEnv();

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
