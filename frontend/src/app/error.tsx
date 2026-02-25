"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl">
                    <AlertTriangle className="w-10 h-10 text-red-400" />
                </div>
                <div>
                    <h2 className="text-xl font-medium text-neutral-200 mb-2">Something went wrong</h2>
                    <p className="text-neutral-500 text-sm max-w-sm">
                        {error.message || "An unexpected error occurred loading this page."}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={reset}
                        className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
                    >
                        Try Again
                    </button>
                    <Link
                        href="/dashboard"
                        className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors"
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        </main>
    );
}
