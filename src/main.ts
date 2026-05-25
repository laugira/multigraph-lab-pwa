import { installOfflineFetch } from './offline-fetch';

installOfflineFetch();

function applyWelcomeVersion() {
    const el = document.getElementById('welcome-version');
    if (!el) return;
    const tFn = (window as Window & { t?: (key: string) => string }).t;
    const title = tFn?.('meta.pageTitle') ?? 'MultiGraph Lab';
    el.textContent = `${title} · v${import.meta.env.VITE_APP_VERSION}`;
}

(window as Window & { applyWelcomeVersion?: () => void }).applyWelcomeVersion = applyWelcomeVersion;

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

async function bootstrap() {
    const base = import.meta.env.BASE_URL;
    await loadScript(`${base}js/i18n.js`);
    applyWelcomeVersion();
    await loadScript(`${base}js/app.js`);

    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
}

bootstrap().catch(err => {
    console.error('MultiGraph Lab bootstrap failed:', err);
});
