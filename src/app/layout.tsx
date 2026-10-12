import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "SpeakUp · Free hook coach for creators",
  description: "Say your video hook out loud and get instant feedback on pace, filler words and wording. Free, by Zina Nyarko.",
  appleWebApp: { capable: true, title: "SpeakUp", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f4f0e8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
