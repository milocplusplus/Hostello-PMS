import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaSetup } from "@/components/shared/PwaSetup";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hostello PMS",
  description: "Property management for Hostello's co-hosting portfolio",
  applicationName: "Hostello PMS",
  appleWebApp: {
    capable: true,
    title: "Hostello",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0910",
  colorScheme: "dark",
  // Lets the UI run under the notch and home indicator; globals.css pays the
  // safe-area insets back so nothing important sits beneath them.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
