import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fenéla",
  applicationName: "Fenéla",
  appleWebApp: {
    capable: true,
    title: "Fenéla",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-[100dvh] bg-[var(--bg-app)] text-[var(--text-main)]">
        <div className="safe-area min-h-[100dvh]">
          <div className="mx-auto min-h-[100dvh] w-full max-w-[420px] px-4 py-5">{children}</div>
        </div>
      </body>
    </html>
  );
}
