import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Atkinson Hyperlegible (OFL, app/fonts/LICENSE.txt): made to be read fast and without mistakes, which is what an
// inbox of notices is for.
const atkinson = localFont({
  src: [
    { path: "./fonts/regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/bold-italic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "noticebox",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
