"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMqtt } from "@/hooks/useMqtt";
import { Activity, Database, LayoutDashboard, FolderArchive } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navigation() {
    const pathname = usePathname();
    const { isConnected, status } = useMqtt();

    const links = [
        { href: "/dashboard", label: "Live Reactor", icon: LayoutDashboard },
        { href: "/projects", label: "Projects Archive", icon: FolderArchive },
    ];

    return (
        <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

                {/* Logo & Navigation */}
                <div className="flex items-center gap-8">
                    <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <Activity className="w-5 h-5 text-indigo-500" />
                        <span className="text-xl font-medium tracking-tight text-neutral-200">
                            Reactor<span className="text-indigo-500">Control</span>
                        </span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-6">
                        {links.map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className={cn(
                                    "flex items-center gap-2 text-sm font-medium transition-colors hover:text-indigo-400",
                                    pathname.startsWith(href) ? "text-indigo-400" : "text-neutral-400"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </Link>
                        ))}
                    </nav>
                </div>

                {/* Global Connection Status */}
                <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2" title="SQLite Database Status">
                        <Database className={cn("w-4 h-4", status.db_connected ? "text-emerald-500" : "text-neutral-600")} />
                        <span className="hidden sm:inline text-neutral-400">DB</span>
                    </div>
                    <div
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors",
                            isConnected
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                : "bg-red-500/10 border-red-500/20 text-red-500"
                        )}
                        title="Mosquitto MQTT Broker Status"
                    >
                        <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                        <span className="hidden sm:inline font-medium">{isConnected ? "Broker Connected" : "Broker Offline"}</span>
                    </div>
                </div>

            </div>
        </header>
    );
}
