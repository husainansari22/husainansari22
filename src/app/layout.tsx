import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KelvinOz AI — Uncensored Coding Assistant",
  description:
    "Private unrestricted AI coding assistant at kelvinoz.com. Expert in JavaScript, TypeScript, Node.js, React, and full-stack development with Hostinger integration.",
  keywords: ["AI", "coding", "JavaScript", "TypeScript", "kelvinoz", "uncensored"],
  openGraph: {
    title: "KelvinOz AI",
    description: "Uncensored coding assistant — kelvinoz.com",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        {children}
      </body>
    </html>
  );
}
