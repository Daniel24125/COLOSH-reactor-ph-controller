"use client";

import React, { useState } from "react";
import { useUser } from "@/context/UserContext";
import { User } from "lucide-react";

export function LocalSignInModal() {
    const { user, setUser, isLoading } = useUser();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Don't render if we are still checking localStorage or if user exists
    if (isLoading || user) {
        return null;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !email.trim()) return;

        setIsSubmitting(true);
        setUser({ name: name.trim(), email: email.trim() });
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <div className="flex flex-col items-center mb-6 text-center">
                    <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-4">
                        <User className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-semibold text-neutral-100 mb-2">Welcome</h2>
                    <p className="text-sm text-neutral-400">
                        Please provide your details to continue. This information is saved locally and used to identify your sessions and calibrations.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1">
                            Full Name
                        </label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors"
                            placeholder="e.g. Dr. Jane Fisher"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1">
                            Email Address
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors"
                            placeholder="jane.fisher@lab.edu"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                            Used for future experiment notifications.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || !name.trim() || !email.trim()}
                        className="w-full mt-4 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all font-medium"
                    >
                        {isSubmitting ? "Saving..." : "Continue"}
                    </button>
                </form>
            </div>
        </div>
    );
}
