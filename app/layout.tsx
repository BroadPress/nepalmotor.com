import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { GoogleAnalytics } from "./GoogleAnalytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const siteTitle = "Nepal Motor | Exchange old cars to EV";
const siteDescription =
  "Nepal Motor is Nepal's No. 1 Car Trading Portal";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/og/default.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og/default.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
