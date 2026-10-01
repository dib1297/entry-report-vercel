import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import FabMenu from "@/components/fab-menu";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Entry Verified Report",
  description: "Data Entry and Verification System for Gram Panchayats",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen flex flex-col antialiased`} suppressHydrationWarning>
        <main className="flex-1 w-full max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
        
        <footer className="w-full pt-12 pb-4 mt-auto">
          <div className="max-w-5xl mx-auto px-4 flex justify-center items-center">
            <p className="text-sm font-medium text-gray-500/80 tracking-wide flex items-center gap-1.5">
              Powered by <span className="text-gray-700 font-bold">Dibya Jyoti</span> ⚡
            </p>
          </div>
        </footer>

        <FabMenu />
      </body>
    </html>
  );
}
