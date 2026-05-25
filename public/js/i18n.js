// MultiGraph Lab — i18n (en, fr, es, ru, pt)

const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'ru', 'pt'];
const LOCALE_STORAGE_KEY = 'multigraph-locale';
const LOCALE_LABELS = { en: 'English', fr: 'Français', es: 'Español', ru: 'Русский', pt: 'Português' };

let currentLocale = 'en';
let messages = {};
let aiPromptMessages = {};

function interpolateParams(value, params = {}) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
        return params[name] !== undefined ? String(params[name]) : `{{${name}}}`;
    });
}

async function loadAiPrompts(locale) {
    const response = await fetch(`/i18n/prompts/${locale}.json`);
    if (response.ok) {
        aiPromptMessages = await response.json();
        return;
    }
    if (locale !== 'en') {
        const fallback = await fetch('/i18n/prompts/en.json');
        aiPromptMessages = fallback.ok ? await fallback.json() : {};
        return;
    }
    aiPromptMessages = {};
}

function resolveLocale() {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
    const browser = (navigator.language || 'en').split('-')[0].toLowerCase();
    return SUPPORTED_LOCALES.includes(browser) ? browser : 'en';
}

async function loadLocale(locale) {
    const response = await fetch(`/i18n/${locale}.json`);
    if (!response.ok) throw new Error(`Locale not found: ${locale}`);
    messages = await response.json();
    currentLocale = locale;
    document.documentElement.lang = locale;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    await loadAiPrompts(locale);
}

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], messages);
    if (typeof value !== 'string') return key;
    return interpolateParams(value, params);
}

function tp(key, params = {}) {
    const value = aiPromptMessages[key];
    if (typeof value !== 'string') return key;
    return interpolateParams(value, params);
}

function applyStaticTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
        el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    document.title = t('meta.pageTitle');
}

async function setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) return;
    await loadLocale(locale);
    applyStaticTranslations();
    updateLocaleSelector();
    if (typeof window.onLocaleChange === 'function') {
        window.onLocaleChange();
    }
}

function updateLocaleSelector() {
    const select = document.getElementById('locale-select');
    if (select) select.value = currentLocale;
}

async function initI18n() {
    await loadLocale(resolveLocale());
    applyStaticTranslations();
    updateLocaleSelector();
}

function initLocaleSelector() {
    const select = document.getElementById('locale-select');
    if (!select) return;
    select.innerHTML = '';
    SUPPORTED_LOCALES.forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = LOCALE_LABELS[code];
        select.appendChild(opt);
    });
    select.value = currentLocale;
    select.addEventListener('change', () => setLocale(select.value));
}

window.t = t;
window.tp = tp;
window.setLocale = setLocale;
window.initI18n = initI18n;
window.applyStaticTranslations = applyStaticTranslations;
window.getCurrentLocale = () => currentLocale;
