import axios from 'axios';
import { API_URL } from '../config/runtime';
import { LocalStorageAuthSessionStore } from '../../../../../infrastructure/storage/LocalStorageAuthSessionStore';
import { WebDeviceSessionStore } from '../../../../../infrastructure/storage/WebDeviceSessionStore';
import { refreshSessionWithLock } from '../../../../../infrastructure/http/authorizedFetch';
import { dispatchAuthSessionExpired } from '../../../../../shared/auth/authSessionEvents';
import { workspaceIdentityChanged } from '../../../../../shared/auth/legacyAuthStorage';

const sessionStore = new LocalStorageAuthSessionStore();
const deviceStore = new WebDeviceSessionStore();

const client = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Scope credentials to this API, including when a caller passes an absolute URL.
function apiPath(config) {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const base = new URL(API_URL, origin);
    const target = new URL(client.getUri(config), origin);
    const prefix = `${base.pathname.replace(/\/$/, '')}/`;
    if (target.origin !== base.origin || !target.pathname.startsWith(prefix)) return null;
    return target.pathname.slice(prefix.length - 1);
}

function isAnonymousPath(path) {
    return /^\/(?:public(?:\/|$)|auth\/(?:login|register|refresh)(?:\/|$))/.test(path);
}

client.interceptors.request.use(
    (config) => {
        config.withCredentials = true;
        const path = apiPath(config);
        if (path && !isAnonymousPath(path)) {
            const token = sessionStore.getTokens()?.accessToken;
            if (token) config.headers.set('Authorization', `Bearer ${token}`);
            else config.headers.delete('Authorization');
            const deviceId = deviceStore.getCurrentDeviceId();
            if (deviceId) config.headers.set('X-Web-Device-ID', deviceId);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

client.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status !== 401 || !originalRequest) return Promise.reject(error);
        const path = apiPath(originalRequest);
        if (!path || isAnonymousPath(path) || path === '/auth/logout') return Promise.reject(error);

        const currentToken = sessionStore.getTokens()?.accessToken;
        const sentToken = originalRequest.headers.get('Authorization')?.replace(/^Bearer /, '');
        if (currentToken && sentToken && sentToken !== currentToken && workspaceIdentityChanged(sentToken, currentToken)) {
            // An account switch must never replay the former user's operation.
            return Promise.reject(error);
        }
        if (originalRequest._retry) {
            sessionStore.clearTokens();
            dispatchAuthSessionExpired({ reason: 'unauthorized' });
            return Promise.reject(error);
        }
        originalRequest._retry = true;

        // Another Workspace/Drive request may have already renewed this session
        // while the failed request was still in flight.
        if (!currentToken || sentToken === currentToken) {
            await refreshSessionWithLock(sessionStore);
        }
        // The request interceptor reads the renewed token for the retry. The
        // shared refresh also persists rotation and handles definitive expiry;
        // network/server failures leave the saved session available for retry.
        return client(originalRequest);
    }
);

export default client;
