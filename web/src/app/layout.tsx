import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { SessionMemoriesProvider } from "@/lib/session-store";

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
  title: "Recuerdos",
  description:
    "Vincula recuerdos digitales a objetos fisicos y encuentralos apuntando con la camara.",
  applicationName: "Recuerdos",
  appleWebApp: {
    capable: true,
    title: "Recuerdos",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // La camara ocupa toda la pantalla, incluida el area del notch.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <OfflineBanner />
        <SessionMemoriesProvider>{children}</SessionMemoriesProvider>
      </body>
    </html>
  );
}
