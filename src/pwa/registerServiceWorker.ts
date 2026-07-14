export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;
  try {
    const url = new URL('service-worker.js', document.baseURI);
    return await navigator.serviceWorker.register(url, {
      scope: './',
      updateViaCache: 'none',
    });
  } catch (error) {
    console.warn('Não foi possível ativar o modo offline.', error);
    return null;
  }
}
