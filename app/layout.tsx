import type { Metadata, Viewport } from "next";
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

const description = "An inbox for the forms on static pages.";

export function generateMetadata(): Metadata {
  const base = process.env.NOTICEBOX_BASE_URL;
  return {
    metadataBase: base ? new URL(base) : undefined,
    title: "noticebox",
    description,
    robots: { index: false, follow: false },
    openGraph: { title: "noticebox", description, siteName: "noticebox", type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#15181b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
