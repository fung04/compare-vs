<script lang="ts">
	import { beforeSnapshot, afterSnapshot, appConfig } from '#lib/stores.js';
	import { compareSnapshots } from '#lib/compare.js';
	import type { VsDiff, CompareResult, PoolDiff } from '#lib/types.js';
	import { get } from 'svelte/store';
	import {
		Card,
		Hr,
		Badge,
		Tooltip,
		ButtonToggleGroup,
		ButtonToggle,
		Indicator,
		Tabs,
		TabItem,
		Accordion,
		AccordionItem
	} from 'flowbite-svelte';
	import { DotsVerticalOutline } from 'flowbite-svelte-icons';
	import { getAvailColor, getEnabledColor, stripCommon } from '#lib/status.js';
	import GtmCard, { type GtmWideIp } from '#lib/components/GtmCard.svelte';

	// ── Load snapshots ────────────────────────────────────────────────────────
	const before = get(beforeSnapshot);
	const after = get(afterSnapshot);
	const { credentials } = get(appConfig);

	const results: (CompareResult | null)[] = credentials.map((_, i) =>
		before[i] && after[i] ? compareSnapshots(before[i], after[i]) : null
	);

	type Filter = 'all' | 'degraded' | 'improved' | 'unchanged';
	let filterType = $state<Filter>('all');

	function handleSelectedFilter(value: string | null | string[]) {
		filterType = (value as Filter | null) ?? 'all';
	}

	function filteredDiffs(result: CompareResult): VsDiff[] {
		return result.diffs.filter((d) => {
			if (filterType === 'degraded') return d.hasDegradation;
			if (filterType === 'improved') return d.hasImprovement;
			if (filterType === 'unchanged') return !d.hasDegradation && !d.hasImprovement;
			return true;
		});
	}

	// GTM diffs carry the same hasDegradation / hasImprovement flags as LTM
	function filteredGtm(result: CompareResult): GtmWideIp[] {
		return ((result.gtmDiffs ?? []) as GtmWideIp[]).filter((w) => {
			if (filterType === 'degraded') return w.hasDegradation;
			if (filterType === 'improved') return w.hasImprovement;
			if (filterType === 'unchanged') return !w.hasDegradation && !w.hasImprovement;
			return true;
		});
	}

	function filteredPools(result: CompareResult): PoolDiff[] {
		return result.poolDiffs.filter((p) => {
			if (filterType === 'degraded') return p.hasDegradation;
			if (filterType === 'improved') return p.hasImprovement;
			if (filterType === 'unchanged') return !p.hasDegradation && !p.hasImprovement;
			return true;
		});
	}

	const gridClass = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';
</script>

<div class="relative w-full py-6 sm:py-10">
	<div class="mx-auto w-[98vw] space-y-4">
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<Card size="xl" class="p-4 sm:p-6 md:p-8">
				<h5 class="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
					Comparison Result
				</h5>
				<p class="leading-relaxed font-normal text-gray-700 dark:text-gray-400">
					Overview of snapshot state transitions and configuration differences across all configured
					devices. Found <span class="font-semibold text-gray-900 dark:text-white"
						>{results.filter(Boolean).length}</span
					> device snapshot comparison(s). Check the breakdown below for modified virtual servers, pool
					members, and status transitions.
				</p>
			</Card>

			<Card size="xl" class="p-4 sm:p-6 md:p-8">
				<h5 class="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
					Filter by Health State
				</h5>
				<p class="leading-relaxed font-normal text-gray-700 dark:text-gray-400">
					Refine the list below based on snapshot diff results. Applies to both LTM and GTM.
				</p>
				<ButtonToggleGroup
					value={filterType}
					size="sm"
					class="mt-2"
					onSelect={handleSelectedFilter}
					color="primary"
				>
					<ButtonToggle value="all" selected={filterType === 'all'}>All</ButtonToggle>
					<ButtonToggle value="degraded" selected={filterType === 'degraded'}>Degraded</ButtonToggle
					>
					<ButtonToggle value="improved" selected={filterType === 'improved'}>Improved</ButtonToggle
					>
					<ButtonToggle value="unchanged" selected={filterType === 'unchanged'}
						>Unchanged</ButtonToggle
					>
				</ButtonToggleGroup>
			</Card>
		</div>

		<Accordion multiple>
			{#each results as result, i (i)}
				<AccordionItem open>
					{#snippet header()}
						Device - {credentials[i].ip || `#${i + 1}`}
					{/snippet}

					{#if !result}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							No before/after snapshot pair for this device. Take both snapshots to compare.
						</p>
					{:else}
						<Tabs>
							<TabItem open>
								{#snippet titleSlot()}
									<span>LTM</span>
								{/snippet}
								<div class={gridClass}>
									{#each filteredDiffs(result) as vs, idx (vs.vsPath)}
										<Card size="sm" class="flex w-full max-w-none flex-1 flex-col p-2">
											<Tooltip triggeredBy="#vspath-{i}-{idx}" placement="bottom">
												<p class="w-64">{vs.vsAfter?.statusReason_virtual}</p>
											</Tooltip>
											<span
												class="mb-2 flex items-center text-lg font-semibold break-all text-gray-900 dark:text-white"
											>
												<Indicator
													size="sm"
													id="vspath-{i}-{idx}"
													color={getAvailColor(vs.vsAfter?.availabilityState_virtual)}
													class="me-1.5"
												/>{stripCommon(vs.vsPath)}</span
											>
											<Accordion flush class="mb-2">
												<Tooltip triggeredBy="#poolpath-{i}-{idx}" placement="top">
													<p class="w-64">{vs.poolAfter?.statusReason_pool}</p>
												</Tooltip>
												<AccordionItem
													open
													classes={{
														button:
															'flex items-center justify-start gap-2 w-full text-left text-sm border-none py-1 font-semibold',
														content: 'ml-8 py-2 border-none text-sm'
													}}
												>
													{#snippet header()}
														<Indicator
															id="poolpath-{i}-{idx}"
															size="sm"
															color={getAvailColor(vs.poolAfter?.availabilityState_pool)}
															class="me-1.5 ml-1"
														/>{stripCommon(vs.poolPath) || 'No Pool'}
													{/snippet}
													{#each vs.memberDiffs as member (member.fullpath)}
														<span
															class="mb-2 flex items-center text-xs break-all text-gray-900 dark:text-white"
														>
															<Indicator
																size="xs"
																color={getAvailColor(member.stateAfter)}
																class="me-1.5"
															/>{stripCommon(member.fullpath)}
														</span>
													{/each}
												</AccordionItem>

												<AccordionItem
													classes={{
														button:
															'text-left text-sm border-none py-1 font-semibold flex justify-start gap-2',
														content: 'py-2 border-none'
													}}
												>
													{#snippet header()}
														<DotsVerticalOutline class="h-4 w-4 shrink-0" />
														Details
													{/snippet}
													<p class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
														Virtual Server Status
													</p>
													<div class="flex flex-col gap-2">
														<div class="flex items-center gap-1">
															<span class="w-12 shrink-0 text-sm text-gray-500 dark:text-gray-400"
																>State</span
															>
															<Badge
																border
																class="capitalize"
																color={getEnabledColor(vs.vsBefore?.enableState_virtual)}
																>{vs.vsBefore?.enableState_virtual}</Badge
															>
															<span class="text-gray-400 dark:text-gray-500">→</span>
															<Badge
																border
																class="capitalize"
																color={getEnabledColor(vs.vsAfter?.enableState_virtual)}
																>{vs.vsAfter?.enableState_virtual}</Badge
															>
														</div>
														<div class="flex items-center gap-1">
															<span class="w-12 shrink-0 text-sm text-gray-500 dark:text-gray-400"
																>Status</span
															>
															<Badge
																border
																class="capitalize"
																color={getAvailColor(vs.vsBefore?.availabilityState_virtual)}
																>{vs.vsBefore?.availabilityState_virtual}</Badge
															>
															<span class="text-gray-400 dark:text-gray-500">→</span>
															<Badge
																border
																class="capitalize"
																color={getAvailColor(vs.vsAfter?.availabilityState_virtual)}
																>{vs.vsAfter?.availabilityState_virtual}</Badge
															>
														</div>
													</div>
													<Hr class="mx-8 my-6 h-1 rounded-sm" />
													<p class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
														Pool Status
													</p>
													<div class="flex flex-col gap-2">
														<div class="flex items-center gap-1">
															<span class="w-12 shrink-0 text-sm text-gray-500 dark:text-gray-400"
																>Status</span
															>
															<Badge
																border
																class="capitalize"
																color={getAvailColor(vs.poolBefore?.availabilityState_pool)}
																>{vs.poolBefore?.availabilityState_pool}</Badge
															>
															<span class="text-gray-400 dark:text-gray-500">→</span>
															<Badge
																border
																class="capitalize"
																color={getAvailColor(vs.poolAfter?.availabilityState_pool)}
																>{vs.poolAfter?.availabilityState_pool}</Badge
															>
														</div>
														<div class="flex items-center gap-1">
															<span class="shrink-0 text-sm text-gray-500 dark:text-gray-400"
																>Active Members</span
															>
															<Badge border color="blue"
																>{vs.poolBefore?.activeMemberCnt} / {vs.poolBefore
																	?.memberCnt}</Badge
															>
															<span class="text-gray-400 dark:text-gray-500">→</span>
															<Badge border color="blue"
																>{vs.poolAfter?.activeMemberCnt} / {vs.poolAfter?.memberCnt}</Badge
															>
														</div>
													</div>
													<Hr class="mx-8 my-6 h-1 rounded-sm" />
													<p class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
														Pool Member Status
													</p>
													<div class="flex flex-col gap-2">
														{#each vs.memberDiffs as member (member.fullpath)}
															<div class="mb-2">
																<span
																	class="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-900 dark:text-white"
																>
																	<Indicator
																		size="xs"
																		color={getAvailColor(member.stateAfter)}
																	/>{stripCommon(member.fullpath)}
																</span>
																<div class="flex items-center gap-1">
																	<span
																		class="w-12 shrink-0 text-sm text-gray-500 dark:text-gray-400"
																		>Status</span
																	>
																	<Badge
																		border
																		color={getAvailColor(member.stateBefore)}
																		class="capitalize">{member.stateBefore}</Badge
																	>
																	<span class="text-gray-400 dark:text-gray-500">→</span>
																	<Badge
																		border
																		color={getAvailColor(member.stateAfter)}
																		class="capitalize">{member.stateAfter}</Badge
																	>
																</div>
															</div>
														{/each}
													</div>
												</AccordionItem>
											</Accordion>
										</Card>
									{:else}
										<p class="col-span-full text-sm text-gray-500 dark:text-gray-400">
											No virtual servers match this filter.
										</p>
									{/each}
								</div>
							</TabItem>

							<TabItem>
								{#snippet titleSlot()}
									<span>Pools</span>
								{/snippet}
								<div class={gridClass}>
									{#each filteredPools(result) as pool, idx (pool.poolPath)}
										<Card size="sm" class="flex w-full max-w-none flex-1 flex-col p-2">
											<Accordion flush class="mb-2">
												<AccordionItem
													open
													classes={{
														button:
															'justify-start w-full text-left text-lg font-semibold break-all text-gray-900 dark:text-white border-none py-1 gap-2',
														content: 'ml-8 py-2 border-none text-sm'
													}}
												>
													{#snippet header()}
														<Tooltip triggeredBy="#poolpath-{i}-{idx}" placement="top">
															<p class="w-64">{pool.poolAfter?.statusReason_pool}</p>
														</Tooltip>
														<Indicator
															size="sm"
															id="poolpath-{i}-{idx}"
															color={getAvailColor(pool.poolAfter?.availabilityState_pool)}
															class="me-1.5 ml-1"
														/>{stripCommon(pool.poolPath) || 'No Pool'}
													{/snippet}
													{#each pool.memberDiffs as member (member.fullpath)}
														<span
															class="mb-2 flex items-center text-xs break-all text-gray-900 dark:text-white"
														>
															<Indicator
																size="xs"
																color={getAvailColor(member.stateAfter)}
																class="me-1.5"
															/>{stripCommon(member.fullpath)}
														</span>
													{/each}
												</AccordionItem>

												<AccordionItem
													classes={{
														button:
															'text-left text-sm border-none py-1 font-semibold flex justify-start gap-2',
														content: 'py-2 border-none'
													}}
												>
													{#snippet header()}
														<DotsVerticalOutline class="h-4 w-4 shrink-0" />
														Details
													{/snippet}
													<p class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
														Pool Status
													</p>
													<div class="flex flex-col gap-2">
														<div class="flex items-center gap-1">
															<span class="w-12 shrink-0 text-sm text-gray-500 dark:text-gray-400"
																>Status</span
															>
															<Badge
																border
																class="capitalize"
																color={getAvailColor(pool.poolBefore?.availabilityState_pool)}
																>{pool.poolBefore?.availabilityState_pool}</Badge
															>
															<span class="text-gray-400 dark:text-gray-500">→</span>
															<Badge
																border
																class="capitalize"
																color={getAvailColor(pool.poolAfter?.availabilityState_pool)}
																>{pool.poolAfter?.availabilityState_pool}</Badge
															>
														</div>
														<div class="flex items-center gap-1">
															<span class="shrink-0 text-sm text-gray-500 dark:text-gray-400"
																>Active Members</span
															>
															<Badge border color="blue"
																>{pool.poolBefore?.activeMemberCnt} / {pool.poolBefore
																	?.memberCnt}</Badge
															>
															<span class="text-gray-400 dark:text-gray-500">→</span>
															<Badge border color="blue"
																>{pool.poolAfter?.activeMemberCnt} / {pool.poolAfter
																	?.memberCnt}</Badge
															>
														</div>
													</div>
													<Hr class="mx-8 my-6 h-1 rounded-sm" />
													<p class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
														Pool Member Status
													</p>
													<div class="flex flex-col gap-2">
														{#each pool.memberDiffs as member (member.fullpath)}
															<div class="mb-2">
																<span
																	class="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-900 dark:text-white"
																>
																	<Indicator
																		size="xs"
																		color={getAvailColor(member.stateAfter)}
																	/>{stripCommon(member.fullpath)}
																</span>
																<div class="flex items-center gap-1">
																	<span
																		class="w-12 shrink-0 text-sm text-gray-500 dark:text-gray-400"
																		>Status</span
																	>
																	<Badge
																		border
																		color={getAvailColor(member.stateBefore)}
																		class="capitalize">{member.stateBefore}</Badge
																	>
																	<span class="text-gray-400 dark:text-gray-500">→</span>
																	<Badge
																		border
																		color={getAvailColor(member.stateAfter)}
																		class="capitalize">{member.stateAfter}</Badge
																	>
																</div>
															</div>
														{/each}
													</div>
												</AccordionItem>
											</Accordion>
										</Card>
									{:else}
										<p class="col-span-full text-sm text-gray-500 dark:text-gray-400">
											No pools match this filter.
										</p>
									{/each}
								</div>
							</TabItem>

							<TabItem>
								{#snippet titleSlot()}
									<span>GTM</span>
								{/snippet}
								<div class={gridClass}>
									{#each filteredGtm(result) as wideIp, idx (wideIp.wideIpPath)}
										<GtmCard {wideIp} uid="{i}-{idx}" />
									{:else}
										<p class="col-span-full text-sm text-gray-500 dark:text-gray-400">
											No wide IPs match this filter.
										</p>
									{/each}
								</div>
							</TabItem>
						</Tabs>
					{/if}
				</AccordionItem>
			{/each}
		</Accordion>
	</div>
</div>
