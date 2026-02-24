import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./contexts/WalletContext";
import WalletConnection from "./components/WalletConnection";

export const metadata: Metadata = {
  title: "STELLAR LAUNCHPAD",
  description: "Decentralized token launchpad on Stellar Soroban",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#040407]">
        <WalletProvider>
          <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#040407]/80 backdrop-blur-xl border-b border-zinc-800/50">
              <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-4">

                {/* Logo */}
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 flex items-center justify-center bg-zinc-900 rounded-xl border border-zinc-800">
                    <div className="absolute inset-0 bg-emerald-500/10 blur-lg rounded-full" />
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-6 w-6 relative z-10"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Rocket shape */}
                      <path
                        d="M12 2C12 2 7 7 7 13C7 16.3 9.2 19 12 20C14.8 19 17 16.3 17 13C17 7 12 2 12 2Z"
                        stroke="url(#launch-gradient)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="2" fill="#10b981" />
                      {/* Fins */}
                      <path
                        d="M7 15L4 18M17 15L20 18"
                        stroke="#10b981"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      {/* Flame */}
                      <path
                        d="M10 20C10 21.5 11 22.5 12 23C13 22.5 14 21.5 14 20"
                        stroke="#34d399"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        opacity="0.6"
                      />
                      <defs>
                        <linearGradient id="launch-gradient" x1="7" y1="2" x2="17" y2="20">
                          <stop stopColor="#10b981" />
                          <stop offset="1" stopColor="#064e3b" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>

                  <div className="flex flex-col -space-y-0.5">
                    <span className="font-black tracking-tighter text-white text-lg font-mono">
                      LAUNCH<span className="text-emerald-400">PAD</span>
                    </span>
                    <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-[0.3em]">
                      Stellar · Soroban
                    </span>
                  </div>
                </div>

                {/* Right side — network pill + wallet */}
                <div className="flex items-center gap-3">
                  {/* Testnet badge */}
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/50">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                      Testnet
                    </span>
                  </div>
                  <WalletConnection />
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-x-hidden">{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}