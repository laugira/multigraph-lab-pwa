import { installOfflineFetch } from './offline-fetch';

installOfflineFetch();

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
    await loadScript(`${base}js/app.js`);

    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
}

bootstrap().catch(err => {
    console.error('MultiGraph Lab bootstrap failed:', err);
});
