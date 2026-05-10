import Context from './Context';
import CryptoJS from 'crypto-js';

import cookies from 'js-cookie';

import { useCallback, useEffect, useState } from 'react';
import { requestAuth } from '../config/request';
import { ToastContainer } from 'react-toastify';
function normalizeUser(user) {
    if (!user || typeof user !== 'object') return {};
    const id = user.id || user.mysqlId || (user._id ? String(user._id) : undefined);
    const readerCode =
        user.readerCode || user.studentId || user.idStudent || null;
    return { ...user, id, readerCode };
}

export function Provider({ children }) {
    const [dataUser, setDataUser] = useState({});

    const fetchAuth = useCallback(async () => {
        try {
            const res = await requestAuth();
            const bytes = CryptoJS.AES.decrypt(res.metadata, import.meta.env.VITE_SECRET_CRYPTO);
            const originalText = bytes.toString(CryptoJS.enc.Utf8);
            if (!originalText) {
                console.error('Failed to decrypt data');
                return;
            }
            const user = JSON.parse(originalText);
            setDataUser(normalizeUser(user));
        } catch (error) {
            console.error('Auth error:', error);
            cookies.remove('logged');
            setDataUser({});
        }
    }, []);

    const refreshAuth = useCallback(async () => {
        const token = cookies.get('logged');
        if (!token) {
            setDataUser({});
            return;
        }
        await fetchAuth();
    }, [fetchAuth]);

    useEffect(() => {
        refreshAuth();
        const handleAuthChanged = () => {
            refreshAuth();
        };
        window.addEventListener('auth-changed', handleAuthChanged);
        return () => window.removeEventListener('auth-changed', handleAuthChanged);
    }, [refreshAuth]);

    return (
        <>
            <Context.Provider
                value={{
                    dataUser,
                    refreshAuth,
                }}
            >
                {children}
                <ToastContainer />
            </Context.Provider>
        </>
    );
}
