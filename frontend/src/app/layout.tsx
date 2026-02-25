import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/context/UserContext";
import { MqttProvider } from "@/context/MqttContext";
import { LocalSignInModal } from "@/components/LocalSignInModal";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "ReactorControl",
    template: "%s | ReactorControl",
  },
  description: "Live pH monitoring and auto-dosing control system for bioreactors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-neutral-950 text-neutral-100 min-h-screen font-sans">
        <UserProvider>
          <MqttProvider>
            <Navigation />
            {children}
            <Toaster />
            <LocalSignInModal />
          </MqttProvider>
        </UserProvider>
      </body>
    </html>
  );
}
