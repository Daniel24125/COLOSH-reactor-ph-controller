"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type User = {
    name: string;
    email: string;
};

type UserContextType = {
    user: User | null;
    setUser: (user: User) => void;
    clearUser: () => void;
    isLoading: boolean;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUserState] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem("colosh_user");
        if (storedUser) {
            try {
                setUserState(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse stored user", e);
            }
        }
        setIsLoading(false);
    }, []);

    const setUser = (newUser: User) => {
        setUserState(newUser);
        localStorage.setItem("colosh_user", JSON.stringify(newUser));
    };

    const clearUser = () => {
        setUserState(null);
        localStorage.removeItem("colosh_user");
    };

    return (
        <UserContext.Provider value={{ user, setUser, clearUser, isLoading }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
}
