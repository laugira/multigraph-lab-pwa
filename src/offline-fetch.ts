import { handleOfflineApi } from './store/graphStore';

const BASE = import.meta.env.BASE_URL;

const API_PATHS = ['/entities', '/relationships', '/relationship-types', '/graph'];

function isApiPath(path: string): boolean {
    return API_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function assetUrl(path: string): string {
    const trimmed = path.replace(/^\//, '');
    return `${BASE}${trimmed}`;
}

export function installOfflineFetch() {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

        if (url.startsWith('http://') || url.startsWith('https://')) {
            if (!url.startsWith(window.location.origin)) {
                return nativeFetch(input, init);
            }
        }

        if (typeof input === 'string') {
            if (isApiPath(input)) {
                const apiResponse = handleOfflineApi(input, method, init);
                if (apiResponse) return apiResponse;
            }
            if (input.startsWith('/i18n/')) {
                return nativeFetch(assetUrl(input));
            }
        }

        return nativeFetch(input, init);
    };
}
