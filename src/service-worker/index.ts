/// <reference lib="webworker" />
//
// Offline support for the deployed static build.
//
// SvelteKit bundles this file and auto-registers it at `<base>/service-worker.js`
// (see `serviceWorker.register` in the kit config). On install it precaches every
// prerendered page, every hashed JS/CSS chunk and every file in `static/`, so a
// cold, fully offline visit still boots the app and can navigate between routes.
//
// Note: this file is intentionally excluded from `svelte-check` (see the generated
// .svelte-kit/tsconfig.json exclude list). To type-check it, extend
// `$app/tsconfig/service-worker` instead of `$app/tsconfig` in tsconfig.json.
import { self } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { resolve } from '$app/paths';

// Changes with every deploy (the generated build version), which lets the activate
// handler below throw away stale caches.
const CACHE = `compare-vs-${version}`;

// Every path here is absolute and already includes the base path, e.g.
// /compare-vs/local or /compare-vs/_app/immutable/entry/start.xxxx.js
const PRECACHE = [
	...prerendered.map((entry) => resolve(entry.path)),
	...immutable.map((entry) => resolve(entry.path)),
	...assets.map((entry) => resolve(entry.path))
];

const PRECACHED = new Set(PRECACHE);

// The app shell. Used as the last-resort offline response for a URL we did not
// precache, so the client-side router can still handle it.
const APP_SHELL = resolve('/');

/** Try the exact pathname, then the same path with/without a trailing slash. */
async function matchFromCache(pathname: string): Promise<Response | undefined> {
	const cache = await caches.open(CACHE);
	const candidates = pathname.endsWith('/')
		? [pathname, pathname.slice(0, -1)]
		: [pathname, `${pathname}/`];

	for (const candidate of candidates) {
		const response = await cache.match(candidate);
		if (response) return response;
	}

	return undefined;
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);

			// addAll() rejects the whole install when a single URL fails, which would
			// leave the app with no worker at all. Add one by one and keep going.
			await Promise.all(
				PRECACHE.map(async (path) => {
					try {
						await cache.add(path);
					} catch (error) {
						console.warn(`[service worker] could not precache ${path}`, error);
					}
				})
			);

			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}

			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;

	// Only same-origin GETs. This deliberately leaves the F5 device API and any
	// other cross-origin traffic untouched.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== new URL(self.registration.scope).origin) return;

	event.respondWith(respond(request, url));
});

async function respond(request: Request, url: URL): Promise<Response> {
	// Navigations: network first so a fresh deploy wins, cache fallback so offline
	// deep links and reloads still work.
	if (request.mode === 'navigate') {
		try {
			const response = await fetch(request);
			if (response.ok) {
				const cache = await caches.open(CACHE);
				// Do not block the response on the cache write.
				void cache.put(request, response.clone());
			}
			return response;
		} catch {
			const cached = await matchFromCache(url.pathname);
			if (cached) return cached;

			const shell = await matchFromCache(APP_SHELL);
			if (shell) return shell;

			return new Response('Offline and this page was not precached.', {
				status: 503,
				headers: { 'content-type': 'text/plain;charset=utf-8' }
			});
		}
	}

	// Hashed chunks and static assets never change under the same URL: cache first.
	if (PRECACHED.has(url.pathname)) {
		const cached = await matchFromCache(url.pathname);
		if (cached) return cached;
	}

	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE);
			void cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await matchFromCache(url.pathname);
		if (cached) return cached;

		return new Response('Offline and this resource was not cached.', {
			status: 503,
			headers: { 'content-type': 'text/plain;charset=utf-8' }
		});
	}
}
