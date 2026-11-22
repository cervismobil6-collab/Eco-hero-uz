import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Google Maps Platform Quota Defense (Tier 1 Global Listener)
(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

// Sync canonical & OpenGraph URLs dynamically for SEO
const syncClientSeoTags = () => {
  try {
    const pageUrl = `${window.location.origin}${window.location.pathname}`;
    const ogImageUrl = `${window.location.origin}/og-cover.jpg`;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', pageUrl);

    const setMeta = (attr: 'property' | 'name', key: string, value: string) => {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', value);
    };
    setMeta('property', 'og:url', pageUrl);
    setMeta('property', 'og:image', ogImageUrl);
    setMeta('name', 'twitter:image', ogImageUrl);
  } catch {
    // ignore DOM SEO sync errors
  }
};
syncClientSeoTags();

// Register Service Worker only in production; in dev, clean up stale SW caches that can cause duplicate Vite React bundles
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);
