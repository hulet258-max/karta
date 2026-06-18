import React, { createContext, useState, useEffect, useContext } from 'react';

// 1. Create the context
const UserContext = createContext(null);

// 2. Create a custom hook for easy access to the context
export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};

// 3. Create the Provider component
export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
        }

        let telegramId = null;
        let telegramUser = null;

        if (tg?.initDataUnsafe?.user) {
            telegramUser = tg.initDataUnsafe.user;
            telegramId = telegramUser.id;
        } else {
            // Fallback for development/testing outside Telegram
            console.warn("Telegram Web App user data not found. Using fallback ID.");
            telegramId = "1303374266";
        }

        if (telegramId) {
            fetch(`${API_BASE_URL}/telegram-user`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ telegramId })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setUser({
                        ...data.user,
                        photo: telegramUser?.photo_url // Merge photo from Telegram object
                    });
                } else {
                    console.error("API call was not successful:", data.message);
                }
            })
            .catch(error => console.error("Failed to fetch user data:", error))
            .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    // The value that will be supplied to all consuming components
    const value = { user, loading };

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
