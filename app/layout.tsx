import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "noticebox",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-3xl px-4 py-6 antialiased">{children}</body>
    </html>
  );
}
