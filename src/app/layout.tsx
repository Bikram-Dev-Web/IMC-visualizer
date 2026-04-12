import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMC Prosperity 4 — Pro Visualizer",
  description:
    "High-performance dual-strategy trading log visualizer with microstructure analytics",
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📈</text></svg>" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased font-sans bg-surface-0 text-text-primary overflow-hidden h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
