/**
 * Service Worker (离线缓存与 PWA 引擎) V2.0.0
 * 策略:
 * 1. 核心应用文件: Network-First (网络优先，有网即更新，离线秒回退缓存，防旧版本驻留)
 * 2. 词典静态分片 (dict/shards/*): Cache-First (缓存优先，避免重复下载节省流量)
 */

const CACHE_NAME = "english-reader-v2.0.0";

const PRECACHE_ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/db.js",
  "js/stemmer.js",
  "js/dict-data.js",
  "js/speech.js",
  "js/vocab.js",
  "js/reader.js",
  "js/app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "dict/shards/lemmas.json",
  "dict/shards/common_phrases.json",
  "dict/shards/meta.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 忽略非 GET 请求
  if (request.method !== "GET") return;

  // 1. 词典分片文件 (Cache-First)
  if (url.pathname.includes("/dict/shards/")) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. 核心 HTML / JS / CSS (Network-First，离线回退 Cache)
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate") {
            return caches.match("index.html");
          }
        });
      })
  );
});
