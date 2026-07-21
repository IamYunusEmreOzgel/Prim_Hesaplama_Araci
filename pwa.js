/**
 * Prim Hesaplama Aracı için bağımsız PWA katmanı.
 *
 * Bu dosya hem tarayıcıda PWA manifestini ve service worker kaydını oluşturur,
 * hem de service worker bağlamında temel çevrim dışı önbellekleme işlemlerini yürütür.
 * Dosya kaldırıldığında uygulamanın ana işlevleri çalışmaya devam eder ve daha önce
 * kurulmuş service worker ilk çevrim içi sayfa açılışında kendini kayıttan çıkarır.
 */

const CACHE_NAME = "prim-hesaplama-pwa-v1";
const APP_ROOT = new URL("./", import.meta.url);
const OFFLINE_PAGE = new URL("index.html", APP_ROOT).href;
const PWA_FILE_URL = import.meta.url;

const isServiceWorker =
    typeof ServiceWorkerGlobalScope !== "undefined" &&
    self instanceof ServiceWorkerGlobalScope;

if (isServiceWorker) {
    async function removePwaIfSourceWasDeleted() {
        try {
            const response = await fetch(PWA_FILE_URL, { cache: "no-store" });
            if (response.ok) return false;

            await caches.delete(CACHE_NAME);
            await self.registration.unregister();
            return true;
        } catch {
            // İnternet yokken mevcut çevrim dışı çalışma korunur.
            return false;
        }
    }

    self.addEventListener("install", (event) => {
        event.waitUntil(
            caches
                .open(CACHE_NAME)
                .then((cache) => cache.add(OFFLINE_PAGE))
                .catch(() => undefined)
                .then(() => self.skipWaiting())
        );
    });

    self.addEventListener("activate", (event) => {
        event.waitUntil(
            caches
                .keys()
                .then((cacheNames) =>
                    Promise.all(
                        cacheNames
                            .filter(
                                (cacheName) =>
                                    cacheName.startsWith("prim-hesaplama-pwa-") &&
                                    cacheName !== CACHE_NAME
                            )
                            .map((cacheName) => caches.delete(cacheName))
                    )
                )
                .then(() => self.clients.claim())
        );
    });

    self.addEventListener("fetch", (event) => {
        const request = event.request;
        const requestUrl = new URL(request.url);

        if (request.method !== "GET" || requestUrl.origin !== self.location.origin) {
            return;
        }

        // PWA dosyasının kendisi önbelleğe alınmaz; böylece silinmesi algılanabilir.
        if (requestUrl.href === PWA_FILE_URL) {
            return;
        }

        if (request.mode === "navigate") {
            event.respondWith(
                removePwaIfSourceWasDeleted().then(async (wasRemoved) => {
                    if (wasRemoved) return fetch(request);

                    try {
                        const response = await fetch(request);
                        const responseCopy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
                        return response;
                    } catch {
                        return (
                            (await caches.match(request)) ||
                            (await caches.match(OFFLINE_PAGE)) ||
                            Response.error()
                        );
                    }
                })
            );
            return;
        }

        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;

                return fetch(request).then((response) => {
                    if (!response || !response.ok) return response;

                    const responseCopy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
                    return response;
                });
            })
        );
    });
} else if (typeof window !== "undefined") {
    const manifest = {
        name: "Prim Hesaplama Aracı",
        short_name: "Prim Aracı",
        description: "Prim, maaş ve işlem kayıtlarını takip etmek için kullanılan hesaplama aracı.",
        start_url: APP_ROOT.href,
        scope: APP_ROOT.href,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1f4f8a",
        lang: "tr",
        icons: [
            {
                src: new URL("assets/img/yeo-logo.svg", APP_ROOT).href,
                sizes: "any",
                type: "image/svg+xml",
                purpose: "any maskable"
            }
        ]
    };

    const manifestBlob = new Blob([JSON.stringify(manifest)], {
        type: "application/manifest+json"
    });
    const manifestUrl = URL.createObjectURL(manifestBlob);

    if (!document.querySelector('link[rel="manifest"]')) {
        const manifestLink = document.createElement("link");
        manifestLink.rel = "manifest";
        manifestLink.href = manifestUrl;
        document.head.appendChild(manifestLink);
    }

    if (!document.querySelector('meta[name="theme-color"]')) {
        const themeMeta = document.createElement("meta");
        themeMeta.name = "theme-color";
        themeMeta.content = manifest.theme_color;
        document.head.appendChild(themeMeta);
    }

    if ("serviceWorker" in navigator) {
        const registerServiceWorker = () => {
            navigator.serviceWorker
                .register(PWA_FILE_URL, {
                    scope: APP_ROOT.pathname,
                    type: "module"
                })
                .catch((error) => {
                    console.warn("PWA service worker kaydı yapılamadı:", error);
                });
        };

        if (document.readyState === "complete") {
            registerServiceWorker();
        } else {
            window.addEventListener("load", registerServiceWorker, { once: true });
        }
    }
}
