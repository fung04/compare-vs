<script module lang="ts">
	import type { AvailState, EnabledState } from '#lib/types.js';

	// Matches the gtmDiffs shape from compareSnapshots(); swap for exported types if $lib/types has them
	type ChangeType =
		'none' | 'degraded' | 'improved' | 'changed' | 'missing_before' | 'missing_after' | string;

	export type GtmMember = {
		poolMemberPath: string;
		stateBefore?: AvailState;
		stateAfter?: AvailState;
		changeType?: ChangeType;
		// Not in the current data; rendered automatically once compare.ts emits them
		enabledStateBefore?: EnabledState;
		enabledStateAfter?: EnabledState;
		statusReasonAfter?: string;
	};
	type PoolState = {
		availabilityState_pool?: AvailState;
		enabledState_pool?: EnabledState;
		statusReason_pool?: string;
	};
	export type GtmPool = {
		poolPath: string;
		poolBefore?: PoolState;
		poolAfter?: PoolState;
		poolChangeType?: ChangeType;
		memberDiffs: GtmMember[];
		hasDegradation: boolean;
		hasImprovement: boolean;
	};
	type WideIpState = {
		availabilityState_wideIp?: AvailState;
		enabledState_wideIp?: EnabledState;
		statusReason_wideIp?: string;
	};
	export type GtmWideIp = {
		wideIpPath: string;
		wideIpType?: string;
		wideipBefore?: WideIpState;
		wideipAfter?: WideIpState;
		wideIpChangeType?: ChangeType;
		poolDiffs: GtmPool[];
		hasDegradation: boolean;
		hasImprovement: boolean;
	};
</script>

<script lang="ts">
	import { Badge, Card, Indicator, Tooltip, Hr } from 'flowbite-svelte';
	import type { IndicatorColor } from '#lib/status.js';
	import { getAvailColor, getEnabledColor, getRecordTypeColor, stripCommon } from '#lib/status.js';

	/** uid must be unique on the page (e.g. "{deviceIdx}-{cardIdx}") so tooltips attach to the right element */
	let { wideIp, uid }: { wideIp: GtmWideIp; uid: string } = $props();

	let expanded = $state(false);

	const memberChanged = (m: GtmMember) =>
		(m.changeType ? m.changeType !== 'none' : m.stateBefore !== m.stateAfter) ||
		m.enabledStateBefore !== m.enabledStateAfter;

	const wB = $derived(wideIp.wideipBefore);
	const wA = $derived(wideIp.wideipAfter);
	const members = $derived(wideIp.poolDiffs.flatMap((p) => p.memberDiffs));
	const upCount = $derived(
		members.filter((m) => m.stateAfter === 'available' || m.stateAfter === 'up').length
	);
	const changedCount = $derived(members.filter(memberChanged).length);
	const hiddenCount = $derived(members.length - changedCount);
</script>

<!-- One badge when unchanged; before → after only when it changed -->
{#snippet transition(
	before: string | undefined,
	after: string | undefined,
	color: (s: any) => IndicatorColor
)}
	<div class="flex shrink-0 items-center gap-1">
		{#if before !== after}
			<Badge border class="capitalize opacity-60" color={color(before)}>{before ?? '—'}</Badge>
			<span class="text-xs text-gray-400">→</span>
		{/if}
		<Badge border class="capitalize" color={color(after)}>{after ?? '—'}</Badge>
	</div>
{/snippet}

<!-- Status reason tooltip; shows the previous reason too when it changed -->
{#snippet reasonTooltip(id: string, before?: string, after?: string)}
	{#if after || before}
		<Tooltip triggeredBy="#{id}" placement="top" class="max-w-xs text-xs">
			{#if before && before !== after}
				<p class="opacity-70">Before: {before}</p>
				<p>Now: {after ?? '—'}</p>
			{:else}
				<p>{after}</p>
			{/if}
		</Tooltip>
	{/if}
{/snippet}

<Card size="sm" class="flex w-full max-w-none flex-col gap-2 p-3">
	<!-- Wide IP header -->
	<div class="flex items-center justify-between gap-2">
		<span
			id="gtm-{uid}"
			class="flex min-w-0 cursor-help items-center gap-1.5 font-semibold text-gray-900 dark:text-white"
		>
			<Indicator size="sm" color={getAvailColor(wA?.availabilityState_wideIp)} />
			<span class="truncate">{stripCommon(wideIp.wideIpPath)}</span>
			{#if wideIp.wideIpType}
				<Badge
					color={getRecordTypeColor(wideIp.wideIpType)}
					class="shrink-0 px-1.5 py-0 text-[10px] font-bold">{wideIp.wideIpType}</Badge
				>
			{/if}
		</span>
		{@render reasonTooltip(`gtm-${uid}`, wB?.statusReason_wideIp, wA?.statusReason_wideIp)}
		{@render transition(wB?.availabilityState_wideIp, wA?.availabilityState_wideIp, getAvailColor)}
	</div>

	<div class="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
		<span>
			{wideIp.poolDiffs.length} pool{wideIp.poolDiffs.length === 1 ? '' : 's'}, {upCount}/{members.length}
			members up
			{#if changedCount}
				<span class="font-medium text-orange-600 dark:text-orange-400"
					>({changedCount} changed)</span
				>
			{/if}
		</span>
		{@render transition(wB?.enabledState_wideIp, wA?.enabledState_wideIp, getEnabledColor)}
	</div>
	<!-- Pools and members -->
	<Hr class="my-0 mt-3 h-1 rounded-sm" />
	<ul class="divide-y divide-gray-200 dark:divide-gray-700">
		{#each wideIp.poolDiffs as pool, pIdx (pool.poolPath)}
			{@const pB = pool.poolBefore}
			{@const pA = pool.poolAfter}
			{@const shown = expanded ? pool.memberDiffs : pool.memberDiffs.filter(memberChanged)}
			<li class="py-2">
				<div
					class="flex items-center justify-between gap-2 text-sm font-medium text-gray-900 dark:text-white"
				>
					<span id="gtm-{uid}-p{pIdx}" class="flex min-w-0 cursor-help items-center gap-1.5">
						<Indicator size="xs" color={getAvailColor(pA?.availabilityState_pool)} />
						<span class="truncate">{stripCommon(pool.poolPath) || 'No pool'}</span>
					</span>
					{@render reasonTooltip(
						`gtm-${uid}-p${pIdx}`,
						pB?.statusReason_pool,
						pA?.statusReason_pool
					)}
				</div>

				<div class="mt-2 ml-4 flex items-center justify-between gap-2">
					{@render transition(
						pB?.availabilityState_pool,
						pA?.availabilityState_pool,
						getAvailColor
					)}
				</div>
				<div class="mt-2 ml-4 flex items-center justify-between gap-2">
					{@render transition(pB?.enabledState_pool, pA?.enabledState_pool, getEnabledColor)}
				</div>

				{#if shown.length}
					<ul class="mt-1.5 ml-4 space-y-1">
						{#each shown as member, mIdx (member.poolMemberPath)}
							<li
								class="flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-300"
							>
								<span
									id="gtm-{uid}-p{pIdx}-m{mIdx}"
									class="flex min-w-0 items-center gap-1.5"
									class:cursor-help={member.statusReasonAfter}
								>
									<Indicator size="xs" color={getAvailColor(member.stateAfter)} />
									<span class="truncate">{stripCommon(member.poolMemberPath)}</span>
								</span>
								{@render reasonTooltip(
									`gtm-${uid}-p${pIdx}-m${mIdx}`,
									undefined,
									member.statusReasonAfter
								)}
								<div class="flex shrink-0 items-center gap-1.5">
									{#if member.enabledStateAfter}
										{@render transition(
											member.enabledStateBefore,
											member.enabledStateAfter,
											getEnabledColor
										)}
									{/if}
									{@render transition(member.stateBefore, member.stateAfter, getAvailColor)}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>

	{#if hiddenCount > 0}
		<button
			type="button"
			class="self-start text-xs text-primary-600 hover:underline dark:text-primary-400"
			onclick={() => (expanded = !expanded)}
		>
			{expanded
				? 'Hide unchanged members'
				: `Show ${hiddenCount} unchanged member${hiddenCount === 1 ? '' : 's'}`}
		</button>
	{/if}
</Card>
