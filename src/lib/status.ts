import type { ComponentProps } from 'svelte';
import type { Indicator } from 'flowbite-svelte';
import type { AvailState, EnabledState, ChangeType } from '#lib/types.js';

export type IndicatorColor = ComponentProps<typeof Indicator>['color'];

export function stripCommon(path?: string): string {
	return path ? path.replace(/^\/Common\//, '') : '';
}

export function getAvailColor(state: AvailState | undefined): IndicatorColor {
	switch (state) {
		case 'available':
		case 'up':
			return 'green';
		case 'unknown':
			return 'blue';
		case 'unavailable':
		case 'offline':
		case 'down':
			return 'red';
		default:
			return 'fuchsia';
	}
}

export function getEnabledColor(state: EnabledState | undefined): IndicatorColor {
	switch (state) {
		case 'enabled':
			return 'green';
		case 'disabled':
			return 'red';
		default:
			return 'fuchsia';
	}
}

export type BadgeColor = 'blue' | 'indigo' | 'purple' | 'teal' | 'amber' | 'pink' | 'gray';

/** Fixed color per GTM record type so the same type always looks the same */
export function getRecordTypeColor(type?: string): BadgeColor {
	switch (type?.toUpperCase()) {
		case 'A':
			return 'blue';
		case 'AAAA':
			return 'indigo';
		case 'CNAME':
			return 'purple';
		case 'MX':
			return 'teal';
		case 'SRV':
			return 'amber';
		case 'NAPTR':
			return 'pink';
		default:
			return 'gray';
	}
}

export type BorderColor = 'border-l-4 border-l-red-500 dark:border-l-red-400' | 'border-l-4 border-l-green-500 dark:border-l-green-400' | 'border-l-4 border-l-amber-500 dark:border-l-amber-400' | '';

export function getBorderColor(type: ChangeType | undefined): BorderColor {
	switch (type) {
		case 'degraded':
			return 'border-l-4 border-l-red-500 dark:border-l-red-400';
		case 'improved':
			return 'border-l-4 border-l-green-500 dark:border-l-green-400';
		case 'changed':
			return 'border-l-4 border-l-amber-500 dark:border-l-amber-400';
		default:
			return '';
	}
}
