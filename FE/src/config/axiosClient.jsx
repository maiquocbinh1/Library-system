import axios from 'axios';
import Cookies from 'js-cookie';

export class ApiClient {
    constructor(baseURL) {
        this.baseURL = baseURL || import.meta.env.VITE_API_URL || '';
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            timeout: 10000,
            withCredentials: true,
        });

        this.setupInterceptors();
    }

    isAuthEndpoint(url = '') {
        return (
            url.includes('/api/user/login') ||
            url.includes('/api/user/register') ||
            url.includes('/api/user/refresh-token') ||
            url.includes('/api/user/logout')
        );
    }

    shouldRedirectToLogin() {
        const protectedPaths = ['/infoUser', '/admin'];
        return protectedPaths.some((path) => window.location.pathname.startsWith(path));
    }

    setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => config,
            (error) => Promise.reject(error),
        );

        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;
                if (error.response?.status === 401 && !originalRequest._retry) {
                    if (this.isAuthEndpoint(originalRequest?.url || '')) {
                        return Promise.reject(error);
                    }
                    originalRequest._retry = true;
                    this.handleAuthFailure();
                }

                return Promise.reject(error);
            },
        );
    }

    handleAuthFailure() {
        Cookies.remove('logged');
        if (this.shouldRedirectToLogin() && window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }

    isLoggedIn() {
        return Cookies.get('logged') === '1';
    }

    async logout() {
        try {
            await this.axiosInstance.get('/api/user/logout');
            Cookies.remove('logged');
        } catch (error) {
            console.error('Logout error:', error);
            Cookies.remove('logged');
        }
    }

    checkAuthStatus() {
        return this.isLoggedIn();
    }

    get(url, config) {
        return this.axiosInstance.get(url, config);
    }

    post(url, data, config) {
        return this.axiosInstance.post(url, data, config);
    }

    put(url, data, config) {
        return this.axiosInstance.put(url, data, config);
    }

    delete(url, config) {
        return this.axiosInstance.delete(url, config);
    }

    patch(url, data, config) {
        return this.axiosInstance.patch(url, data, config);
    }
}

export const apiClient = new ApiClient();
