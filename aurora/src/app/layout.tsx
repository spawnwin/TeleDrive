import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

const feedDisplay = Manrope({
  variable: "--font-feed-display",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Aurora — современный мессенджер",
  description:
    "Aurora — красивый и быстрый мессенджер с realtime-сообщениями, группами, эмодзи и удобным интерфейсом на русском языке.",
  keywords: ["мессенджер", "чат", "сообщения", "Aurora", "онлайн чат"],
  authors: [{ name: "Aurora Team" }],
  manifest: "/manifest.json",
  applicationName: "Aurora",
  appleWebApp: {
    capable: true,
    title: "Aurora",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
    // iOS home-screen PWA: full-bleed with notch / Dynamic Island
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Aurora",
    // theme-color intentionally NOT duplicated here — viewport.themeColor
    // below is the single source. A second (violet) meta tag here made
    // Android Chrome paint the PWA's system bars purple/black instead of
    // the app background, so the app looked like it stopped above the
    // gesture bar instead of reaching the bottom like Telegram.
    "color-scheme": "dark",
    // iOS splash uses the apple-touch-icon; ensure it's referenced explicitly too
    "apple-touch-icon": "/apple-touch-icon.png",
    "format-detection": "telephone=no",
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "apple-touch-icon-precomposed", url: "/apple-touch-icon.png" },
    ],
  },
  openGraph: {
    title: "Aurora — современный мессенджер",
    description: "Красивый и быстрый мессенджер на русском языке",
    siteName: "Aurora",
    type: "website",
  },
};

// viewport-fit=cover lets the app extend into the notch / Dynamic Island,
// and the safe-area-inset-* CSS env() values drive actual padding in the
// shorts feed and chat view.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Single static value on purpose: the app forces dark mode (html.dark), and
  // media-conditional theme-color lists let light-scheme phones pick the
  // violet variant for the standalone PWA's system bars. #0b0b1a matches
  // --background, so the status bar and Android gesture/navigation bar blend
  // into the app — Telegram-style, the UI visually owns the whole screen.
  themeColor: "#0b0b1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // bg-background on <html> too: overscroll rubber-banding and any area
  // outside <body> (mobile browsers, standalone PWA) shows the root
  // element's background — without it those regions render UA-black and
  // the app looks like it ends above the bottom of the screen.
  return (
    <html lang="ru" suppressHydrationWarning className="dark bg-background">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${feedDisplay.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster
          position="top-center"
          // Keep toasts below notch / status bar / Dynamic Island (viewport-fit=cover).
          offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: 'rounded-xl border-border !z-[99999]',
            },
          }}
        />
      </body>
    </html>
  );
}
