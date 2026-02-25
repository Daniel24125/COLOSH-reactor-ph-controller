"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMqtt } from "@/hooks/useMqtt";
import { useUser } from "@/context/UserContext";
import { Activity, Cpu, LayoutDashboard, FolderArchive, SlidersHorizontal, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navigation() {
    const pathname = usePathname();
    const { isConnected, isServerOnline } = useMqtt();
    const { user, clearUser } = useUser();

    const links = [
        { href: "/dashboard", label: "Live Reactor", icon: LayoutDashboard },
        { href: "/calibration", label: "Calibration", icon: SlidersHorizontal },
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

                {/* Global Connection Status + User */}
                <div className="flex items-center gap-3 text-sm">
                    <div
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors",
                            isServerOnline === true
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : isServerOnline === false
                                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                                    : "bg-neutral-800/60 border-neutral-700 text-neutral-500"
                        )}
                        title="Reactor Server (RPi) Status"
                    >
                        <Cpu className="w-4 h-4" />
                        <div className={cn(
                            "w-2 h-2 rounded-full",
                            isServerOnline === true ? "bg-emerald-500 animate-pulse" :
                                isServerOnline === false ? "bg-red-500" :
                                    "bg-neutral-500 animate-pulse"
                        )} />
                        <span className="hidden sm:inline font-medium">
                            {isServerOnline === true ? "Server Online" : isServerOnline === false ? "Server Offline" : "Server..."}
                        </span>
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

                    {/* User avatar + logout */}
                    {user && (
                        <div className="flex items-center gap-2 pl-1 border-l border-neutral-800">
                            <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-400 select-none" title={`${user.name} — ${user.email}`}>
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <button
                                onClick={clearUser}
                                title="Log out"
                                className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </header>
    );
}
