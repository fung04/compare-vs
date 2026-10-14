import { writable } from 'svelte/store';
import type { Credentials, F5Snapshot, AppConfig } from './types.js';

export const mode = writable<'online' | 'local' | null>(null);
export const credentials = writable<Credentials>({
	id: -1,
	ip: '',
	username: '',
	password: '',
	isGTM: false
});
export const beforeSnapshot = writable<F5Snapshot[] | []>([]);
export const afterSnapshot = writable<F5Snapshot[] | []>([]);
export const appConfig = writable<AppConfig>({
	credentials: [],
	mode: 'Automatic'
});
