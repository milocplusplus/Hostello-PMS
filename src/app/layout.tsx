import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PwaSetup } from "@/components/shared/PwaSetup";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** The one face for text, headings and figures. globals.css makes headings
 *  heavy, so weight carries the hierarchy rather than a second family. */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
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
    apple: "/icons/apple-touch-icon.png?v=2",
  },
};

export const viewport: Viewport = {
  themeColor: "#07060c",
  colorScheme: "dark",
  // Lets the UI run under the notch and home indicator; globals.css pays the
  // safe-area insets back so nothing important sits beneath them.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
