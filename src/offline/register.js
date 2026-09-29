export async function registerOfflineService({ onUpdate, onReady, onError } = {}) {
  if (!('serviceWorker' in navigator)) return null;

  const base = import.meta.env?.BASE_URL || '/';
  const workerUrl = new URL('sw.js', document.baseURI).href;
  try {
    const registration = await navigator.serviceWorker.register(workerUrl, { scope: base });

    if (registration.waiting) onUpdate?.(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdate?.(registration);
      });
    });

    await navigator.serviceWorker.ready;
    onReady?.(registration);
    return registration;
  } catch (error) {
    onError?.(error);
    return null;
  }
}

export function activateOfflineUpdate(registration) {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
