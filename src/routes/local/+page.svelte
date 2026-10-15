<script lang="ts">
	import { buildSnapshot } from '#lib/f5parser.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import {
		BreadcrumbStepper,
		Button,
		Card,
		Label,
		Input,
		Radio,
		Hr,
		Fileupload,
		Badge,
		Select,
		InputAddon,
		ButtonGroup,
		Clipboard,
		Toggle
	} from 'flowbite-svelte';
	import {
		UserCircleOutline,
		CogOutline,
		EyeOutline,
		UserCircleSolid,
		DesktopPcSolid,
		CreditCardSolid,
		CheckOutline,
		ClipboardCleanSolid
	} from 'flowbite-svelte-icons';

	import { appConfig, beforeSnapshot, afterSnapshot } from '#lib/stores.js';

	type requiredFiles = {
		virtual: boolean;
		virtualStats: boolean;
		poolStats: boolean;
		pool: boolean;
		gtmWideIp?: boolean;
		gtmWideIpStats?: boolean;
		gtmPoolMembersStats?: boolean;
	};
	type FileState = {
		name: string;
		data: Record<string, string>;
		error: string | null;
		required: requiredFiles;
	} | null;

	let current = $state(1);
	let numberOfDevices = $state<number>(1);
	let mode = $state<'Guided' | 'Manual'>('Manual');
	let deviceInfo = $state<
		{ id: number; ip: string; username: string; password: string; isGTM: boolean }[]
	>([]);

	function handleIncrement() {
		numberOfDevices += 1;
	}
	function handleDecrement() {
		if (numberOfDevices > 1) {
			numberOfDevices -= 1;
		}
	}
	let beforeFiles = $state<{ [key: number]: FileState }>({});
	let afterFiles = $state<{ [key: number]: FileState }>({});

	function validateFileData(data: any, fileName: string, isGTM: boolean): FileState {
		let requiredItem: requiredFiles = {
			virtual: !!data?.virtual,
			virtualStats: !!data?.virtualStats,
			poolStats: !!data?.poolStats,
			pool: !!data?.pool
		};

		if (isGTM) {
			if (data?.gtm) {
				Object.keys(data.gtm).forEach((key) => {
					requiredItem.gtmWideIp = !!data.gtm[key]?.wideip;
					requiredItem.gtmWideIpStats = !!data.gtm[key]?.wideipStats;
					requiredItem.gtmPoolMembersStats = !!data.gtm[key]?.poolMembersStats;
				});
			} else {
				requiredItem.gtmWideIp = false;
				requiredItem.gtmWideIpStats = false;
				requiredItem.gtmPoolMembersStats = false;
			}
		}

		const missingRequired = Object.keys(requiredItem).find(
			(key) => !requiredItem[key as keyof requiredFiles]
		);

		return {
			name: fileName,
			data,
			error: missingRequired ? `Missing required field: ${missingRequired}` : null,
			required: requiredItem
		};
	}

	async function handleFile(phase: 'before' | 'after', idx: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		let entry: FileState;
		try {
			const text = await file.text();
			const data = JSON.parse(text);
			entry = validateFileData(data, file.name, deviceInfo[idx].isGTM);
		} catch {
			entry = {
				name: file.name,
				data: {},
				error: 'Invalid JSON — could not parse file.',
				required: {
					virtual: false,
					virtualStats: false,
					poolStats: false,
					pool: false
				}
			};
		}

		if (phase === 'before') beforeFiles = { ...beforeFiles, [idx]: entry };
		else afterFiles = { ...afterFiles, [idx]: entry };
	}

	function clearFile(phase: 'before' | 'after', idx: number) {
		if (phase === 'before') {
			delete beforeFiles[idx];
		} else {
			delete afterFiles[idx];
		}
	}

	const beforeReady = $derived(
		Array.from({ length: numberOfDevices }, (_, i) => i).every((i) => {
			return beforeFiles[i]?.required && !beforeFiles[i]!.error;
		})
	);

	const afterReady = $derived(
		Array.from({ length: numberOfDevices }, (_, i) => i).every(
			(i) => afterFiles[i]?.required && !afterFiles[i]!.error
		)
	);
	let building = $state(false);
	let buildError = $state('');
	const canCompare = $derived(beforeReady && afterReady);

	async function compare() {
		if (!canCompare) return;

		building = true;
		buildError = '';

		try {
			// Handle before snapshot
			for (let i = 0; i < numberOfDevices; i++) {
				const file = beforeFiles[i];
				if (!file || file.error) continue;

				const vsConfigBefore = file.data.virtual;
				const vsStatsBefore = file.data.virtualStats;
				const poolStatsBefore = file.data.poolStats;
				const poolConfigBefore = file.data.pool;
				let gtmWideIpBefore: any[] = [];
				let gtmWideIpStatsBefore: any[] = [];
				let gtmPoolMembersStatsBefore: any[] = [];

				if (deviceInfo[i].isGTM && file.data.gtm) {
					Object.values(file.data.gtm).forEach((entry: any) => {
						// Wide ip list
						const wideipItems = entry.wideip; // is a array of wipeip
						if (wideipItems) {
							gtmWideIpBefore = [...gtmWideIpBefore, wideipItems];
						}
						// old version
						// gtmWideIpBefore = [...gtmWideIpBefore, ...Object.values(entry.wideip.items)]

						// Wide IP stat list
						const wideipStatsEntries = entry.wideipStats.entries; // { key_1: {}, key_2: {} }
						if (wideipStatsEntries) {
							gtmWideIpStatsBefore = { ...gtmWideIpStatsBefore, ...wideipStatsEntries };
						}
						// old version
						// Object.values(wideipStatsEntries ?? {}).forEach((statEntry: any) => {
						// 	gtmWideIpStatsBefore = [
						// 		...gtmWideIpStatsBefore,
						// 		statEntry.nestedStats?.entries ?? {}
						// 	];
						// });

						// Pool Stat and Member Stat is in the same list
						const gtmPoolMembersStatsEntries = entry.poolMembersStats.entries;
						if (gtmPoolMembersStatsEntries) {
							gtmPoolMembersStatsBefore = {
								...gtmPoolMembersStatsBefore,
								...gtmPoolMembersStatsEntries
							};
						}
						// old version
						// Object.values(gtmPoolMembersStatsEntries ?? {}).forEach((poolEntry: any) => {
						// 	// console.log(Object.keys(poolEntry));
						// 	gtmPoolMembersStatsBefore = [
						// 		...gtmPoolMembersStatsBefore,
						// 		poolEntry.nestedStats?.entries ?? {}
						// 	];
						// });
					});
				}
				// console.log('DEBUG: gtmWideIpBefore', gtmWideIpBefore);
				// console.log('DEBUG: gtmWideIpStatsBefore', gtmWideIpStatsBefore);
				// console.log('DEBUG: gtmPoolMembersStatsBefore', gtmPoolMembersStatsBefore);

				const before = buildSnapshot(
					vsStatsBefore,
					poolStatsBefore,
					vsConfigBefore,
					poolConfigBefore,
					gtmWideIpBefore,
					gtmWideIpStatsBefore,
					gtmPoolMembersStatsBefore
				);
				beforeSnapshot.update((snap) => {
					const updated = [...snap];
					updated[i] = before;
					return updated;
				});
			}
			// Handle after snapshot
			for (let i = 0; i < numberOfDevices; i++) {
				const file = afterFiles[i];
				if (!file || file.error) continue;

				const vsConfigAfter = file.data.virtual;
				const vsStatsAfter = file.data.virtualStats;
				const poolStatsAfter = file.data.poolStats;
				const poolConfigAfter = file.data.pool;

				let gtmWideIpAfter: any[] = [];
				let gtmWideIpStatsAfter: any[] = [];
				let gtmPoolMembersStatsAfter: { [key: string]: any } = {};

				if (deviceInfo[i].isGTM && file.data.gtm) {
					Object.values(file.data.gtm).forEach((entry: any) => {
						// Wide ip list
						const wideipItems = entry.wideip; // is a array of wipeip
						if (wideipItems) {
							gtmWideIpAfter = [...gtmWideIpAfter, wideipItems];
						}
						// gtmWideIpAfter = [...gtmWideIpAfter, ...Object.values(entry.wideip.items)];

						// Wide IP stat list
						const wideipStatsEntries = entry.wideipStats.entries; // { key_1: {}, key_2: {} }
						if (wideipStatsEntries) {
							gtmWideIpStatsAfter = { ...gtmWideIpStatsAfter, ...wideipStatsEntries };
						}
						// old version
						// Object.values(wideipStatsEntries ?? {}).forEach((statEntry: any) => {
						// 	gtmWideIpStatsAfter = [...gtmWideIpStatsAfter, statEntry.nestedStats?.entries ?? {}];
						// });

						// Pool Stat and Member Stat is in the same list
						const gtmPoolMembersStatsEntries = entry.poolMembersStats.entries;
						if (gtmPoolMembersStatsEntries) {
							gtmPoolMembersStatsAfter = {
								...gtmPoolMembersStatsAfter,
								...gtmPoolMembersStatsEntries
							};
						}
						// old version
						// Object.values(gtmPoolMembersStatsEntries ?? {}).forEach((poolEntry: any) => {
						// 	// console.log(Object.keys(poolEntry));
						// 	gtmPoolMembersStatsAfter = [
						// 		...gtmPoolMembersStatsAfter,
						// 		poolEntry.nestedStats?.entries ?? {}
						// 	];
						// });
					});
				}
				// console.log('DEBUG: gtmWideIpAfter', gtmWideIpAfter);
				// console.log('DEBUG: gtmWideIpStatsAfter', gtmWideIpStatsAfter);
				// console.log('DEBUG: gtmPoolMembersStatsAfter', gtmPoolMembersStatsAfter);

				const after = buildSnapshot(
					vsStatsAfter,
					poolStatsAfter,
					vsConfigAfter,
					poolConfigAfter,
					gtmWideIpAfter,
					gtmWideIpStatsAfter,
					gtmPoolMembersStatsAfter
				);

				afterSnapshot.update((snap) => {
					const updated = [...snap];
					updated[i] = after;
					return updated;
				});
			}
			console.log('DEBUG: Snapshots Built', $beforeSnapshot, $afterSnapshot);
			goto(resolve('compare'));
		} catch (err) {
			buildError = err instanceof Error ? err.message : 'Failed to process files.';
			building = false;
		}
	}

	$effect(() => {
		//$inspect.trace('Create deviceInfo');
		const current = deviceInfo.length;
		if (numberOfDevices > current) {
			for (let i = current; i < numberOfDevices; i++) {
				deviceInfo.push({ id: i, ip: '', username: '', password: '', isGTM: false });
			}
		} else {
			deviceInfo.splice(numberOfDevices);
		}
	});

	$effect(() => {
		// user change the mode, reset the deviceInfo
		if (mode !== 'Guided') {
			deviceInfo = [];
		}
	});

	let previousGTMState = new Map();

	$effect(() => {
		$inspect.trace('Update appConfig');

		const changedDevices: typeof deviceInfo = [];

		for (const device of deviceInfo) {
			const prev = previousGTMState.get(device.id); // adjust key to whatever uniquely IDs a device
			if (prev !== undefined && prev !== device.isGTM) {
				changedDevices.push(device);
			}
			previousGTMState.set(device.id, device.isGTM);
		}

		const hasIncompleteDevice = deviceInfo.some(
			(device) => !device.ip || !device.username || !device.password
		);

		if (hasIncompleteDevice || changedDevices.length > 0) {
			appConfig.update((config) => ({
				...config,
				mode,
				credentials: deviceInfo
			}));

			for (const dev of changedDevices) {
				const idx = deviceInfo.findIndex((d) => d.id === dev.id);
				if (idx !== -1) {
					if (
						beforeFiles[idx]?.data &&
						beforeFiles[idx]?.error !== 'Invalid JSON — could not parse file.'
					) {
						beforeFiles = {
							...beforeFiles,
							[idx]: validateFileData(beforeFiles[idx]!.data, beforeFiles[idx]!.name, dev.isGTM)
						};
					}
					if (
						afterFiles[idx]?.data &&
						afterFiles[idx]?.error !== 'Invalid JSON — could not parse file.'
					) {
						afterFiles = {
							...afterFiles,
							[idx]: validateFileData(afterFiles[idx]!.data, afterFiles[idx]!.name, dev.isGTM)
						};
					}
				}
			}
		}
	});

	const steps = [
		{
			id: 1,
			label: 'Setup',
			icon: UserCircleOutline,
			iconClass: 'h-3 w-3'
		},
		{
			id: 2,
			label: 'Capture',
			icon: CogOutline,
			iconClass: 'h-3 w-3'
		},
		{
			id: 3,
			label: 'Upload',
			icon: EyeOutline,
			iconClass: 'h-3 w-3'
		}
	];

	let targetedDevice = $state<'linux' | 'windows_cmd' | 'windows_ps'>('linux');
	let devices: { value: string; name: string }[] = [
		{ value: 'linux', name: 'Linux (F5)' },
		{ value: 'windows_cmd', name: 'Windows (CMD)' },
		{ value: 'windows_ps', name: 'Windows (PowerShell)' }
	];

	let codeBlockValue = $state('');
	let codeBlockSuccess = $state(false);

	function onclick(ev: MouseEvent): void {
		const target = ev.target as HTMLElement;
		const codeBlock = target.ownerDocument.querySelector('#code-block');
		if (codeBlock) {
			codeBlockValue = codeBlock.textContent || '';
		}
	}
</script>

<div class="mx-auto max-w-screen-xl px-4 py-8 lg:px-6 lg:py-16">
	<div class="mx-auto max-w-4xl flex-1 space-y-4">
		<Card size="xl" class="p-4 sm:p-6 md:p-8">
			{#if mode === 'Manual'}
				<h5 class="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
					Local Mode — Upload JSON Files
				</h5>
				<p class="leading-tight font-normal text-gray-700 dark:text-gray-400">
					Upload the exported JSON files from your BIG-IPs for both "before" and "after" upgrade
					stages. All comparison processing happens locally in your browser, so your data never
					leaves your network.
				</p>
			{:else if mode === 'Guided'}
				<h5 class="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
					Guided Mode — Enter BIG-IP IP Addresses
				</h5>
				<p class="leading-tight font-normal text-gray-700 dark:text-gray-400">
					Select the target OS (Linux, Windows CMD, or Windows PowerShell), then enter the IP
					address of each BIG-IP and the credentials. The tool will guide you through the process
					capturing VS config, VS stats, pool config, pool stats.
				</p>
			{/if}
		</Card>

		<BreadcrumbStepper class="flex w-full justify-center" {steps} bind:current />

		<!-- Step 1-->
		<Card size="xl" class="p-4 sm:p-6 md:p-8">
			<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
				Initial Setup
			</h5>
			<Label class="my-2 block">Number of Devices</Label>
			<div class="mb-2">
				<div class="mb-2 flex flex-2 flex-row gap-2">
					<Input required placeholder={String(numberOfDevices)} bind:value={numberOfDevices} />
					<Button onclick={handleIncrement}>+</Button>
					<Button onclick={handleDecrement}>-</Button>
				</div>
				<div class="mb-2 flex flex-2 flex-row gap-2">
					<Radio name="mode" bind:group={mode} value="Guided">Guided</Radio>
					<Radio name="mode" bind:group={mode} value="Manual">Manual</Radio>
				</div>
			</div>
			{#if mode === 'Guided'}
				<div class="my-2">
					<Label class="mb-2 block">Device OS</Label>
					<Select class="mt-2" items={devices} bind:value={targetedDevice} />
				</div>
			{/if}
		</Card>

		<!-- Code Block Snippet -->
		{#snippet codeblock(script: string)}
			<div
				class="mx-2 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl"
			>
				<!-- Code Block Header / Mac Style Dots -->
				<div
					class="flex items-center justify-between border-b border-slate-800 bg-slate-800/50 px-4 py-3"
				>
					<div class="flex space-x-2">
						<div class="h-3 w-3 rounded-full bg-rose-500"></div>
						<div class="h-3 w-3 rounded-full bg-amber-500"></div>
						<div class="h-3 w-3 rounded-full bg-emerald-500"></div>
					</div>
					<span class="font-mono text-xs text-slate-400">index.js</span>
					<Clipboard
						color={codeBlockSuccess ? 'alternative' : 'primary'}
						bind:value={codeBlockValue}
						bind:success={codeBlockSuccess}
						size="sm"
						class="h-8 justify-end px-2.5 font-medium focus:ring-0"
						{onclick}
					>
						{#if codeBlockSuccess}
							<CheckOutline class="h-3 w-3" /> Copied
						{:else}
							<ClipboardCleanSolid class="h-3 w-3" /> Copy
						{/if}
					</Clipboard>
				</div>

				<!-- Code Content Area -->
				<pre
					class="scrollbar-thin overflow-x-auto p-4 font-mono text-sm leading-relaxed text-slate-100">
					<code id="code-block" class="block text-left font-mono whitespace-pre">{script}</code>
				</pre>
			</div>
		{/snippet}

		<!-- Step 1 Guided-->
		{#if mode === 'Guided'}
			<Card size="xl" class="p-4 sm:p-6 md:p-8">
				<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
					F5 Credentials
				</h5>
				{#each deviceInfo as device, index}
					<Label class="my-2 block">Device {index + 1} Credentials</Label>
					<div class="mb-2 flex flex-2 flex-row gap-2">
						<ButtonGroup class="w-full">
							<InputAddon>
								<DesktopPcSolid class="h-4 w-4 text-gray-500 dark:text-gray-400" />
							</InputAddon>
							<Input placeholder="Device IP" bind:value={device.ip} />
						</ButtonGroup>
						<ButtonGroup class="w-full">
							<InputAddon>
								<UserCircleSolid class="h-4 w-4 text-gray-500 dark:text-gray-400" />
							</InputAddon>
							<Input placeholder="Username" bind:value={device.username} />
						</ButtonGroup>
						<ButtonGroup class="w-full">
							<InputAddon>
								<CreditCardSolid class="h-4 w-4 text-gray-500 dark:text-gray-400" />
							</InputAddon>
							<Input placeholder="Password" bind:value={device.password} />
						</ButtonGroup>
					</div>
					<div class="mb-2 flex flex-2 flex-row gap-2">
						<Toggle
							size="small"
							bind:checked={device.isGTM}
							onclick={() => (device.isGTM = !device.isGTM)}>BIG-IP GTM Device</Toggle
						>
					</div>
				{/each}
			</Card>

			<!-- Step 2 Guided Scripts -->
			<Card size="xl" class="p-4 sm:p-6 md:p-8">
				<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
					Running Scripts
				</h5>
				{#each deviceInfo as device, index}
					{#if targetedDevice === 'windows_ps'}
						<Label class="my-2 block"
							>Windows PowerShell script to run on the device {device.ip || `#${index + 1}`}:</Label
						>
						{@render codeblock(`
$v  = curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/virtual" | Out-String
$vs = curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/virtual/stats" | Out-String
$ps = curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/pool/stats" | Out-String
$p  = curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/pool?expandSubcollections=true" | Out-String
${
	device.isGTM
		? `
$types = 'a','aaaa','cname','https','mx','naptr','srv','svcb'

$gtmParts = foreach ($t in $types) {
    $wideip = curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/gtm/wideip/$t?expandSubcollections=true" | Out-String
    $wideipStats = curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/gtm/wideip/$t/stats?expandSubcollections=true" | Out-String
    $poolMembersStats = curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/gtm/pool/$t/members/stats?expandSubcollections=true" | Out-String
    '"' + $t + '":{"wideip":' + $wideip + ',"wideipStats":' + $wideipStats + ',"poolMembersStats":' + $poolMembersStats + '}'
}
$gtm = '{' + ($gtmParts -join ',') + '}'
`
		: ''
}
'{"virtual":' + $v + ',"virtualStats":' + $vs + ',"poolStats":' + $ps + ',"pool":' + $p + ${device.isGTM ? `',"gtm":' + $gtm + ` : ''}'}' | Set-Content ${device.ip}_f5.json
`)}
					{:else if targetedDevice === 'windows_cmd'}
						<Label class="my-2 block"
							>Windows CMD script to run on the device {device.ip || `#${index + 1}`}:</Label
						>
						{@render codeblock(`(
  echo {"virtual":
  curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/virtual"
  echo ,"virtualStats":
  curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/virtual/stats"
  echo ,"poolStats":
  curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/pool/stats"
  echo ,"pool":
  curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/ltm/pool?expandSubcollections=true"${
		device.isGTM
			? `
  echo ,"gtm":{"_":null
  for %%t in (a aaaa cname https mx naptr srv svcb) do (
    echo ,"%%t":{"wideip":
    curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/gtm/wideip/%%t?expandSubcollections=true"
    echo ,"wideipStats":
    curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/gtm/wideip/%%t/stats?expandSubcollections=true"
    echo ,"poolMembersStats":
    curl.exe -sk -u ${device.username}:${device.password} "https://${device.ip}/mgmt/tm/gtm/pool/%%t/members/stats?expandSubcollections=true"
    echo }
  )
  echo }`
			: ''
	}
  echo }
) > ${device.ip}_cmd_f5.json`)}
					{:else if targetedDevice === 'linux'}
						<Label class="my-2 block"
							>Linux Bash script to run on the device {device.ip || `#${index + 1}`}:</Label
						>
						{@render codeblock(`{
  echo -n '{"virtual":'
  curl -sk -g -u '${device.username}:${device.password}' 'https://${device.ip}/mgmt/tm/ltm/virtual'
  echo -n ',"virtualStats":'
  curl -sk -g -u '${device.username}:${device.password}' 'https://${device.ip}/mgmt/tm/ltm/virtual/stats'
  echo -n ',"poolStats":'
  curl -sk -g -u '${device.username}:${device.password}' 'https://${device.ip}/mgmt/tm/ltm/pool/stats'
  echo -n ',"pool":'
  curl -sk -g -u '${device.username}:${device.password}' 'https://${device.ip}/mgmt/tm/ltm/pool?expandSubcollections=true'
${
	device.isGTM
		? `
  echo -n ',"gtm":{'
  first=1
  for t in a aaaa cname https mx naptr srv svcb; do
    if [ "$first" -eq 1 ]; then
      first=0
    else
      echo -n ','
    fi
    echo -n '"'$t'":{"wideip":'
    curl -sk -g -u '${device.username}:${device.password}' 'https://${device.ip}/mgmt/tm/gtm/wideip/'$t'?expandSubcollections=true'
    echo -n ',"wideipStats":'
    curl -sk -g -u '${device.username}:${device.password}' 'https://${device.ip}/mgmt/tm/gtm/wideip/'$t'/stats?expandSubcollections=true'
    echo -n ',"poolMembersStats":'
    curl -sk -g -u '${device.username}:${device.password}' 'https://${device.ip}/mgmt/tm/gtm/pool/'$t'/members/stats?expandSubcollections=true'
    echo -n '}'
  done
  echo -n '}'
`
		: ''
}
  echo '}'
} > /var/tmp/${device.ip}_f5.json`)}
					{/if}
				{/each}
			</Card>
		{/if}

		<!-- Step 3 Upload Config-->
		<div class="flex flex-row gap-4">
			<Card size="xl" class="flex flex-1 flex-col p-4 sm:p-6 md:p-8">
				<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
					Snapshot Before Upgrade
				</h5>
				<p class="leading-tight font-normal text-gray-700 dark:text-gray-400">
					Captured before the firmware upgrade
				</p>
				<Hr class="mx-auto my-4 h-1 w-48 rounded-sm md:my-10" />
				{#each deviceInfo as device, index}
					<Label id="event" class="pb-2">Snapshot For Device {device.ip || `#${index + 1}`}</Label>
					<Fileupload
						clearable
						clearableOnClick={() => clearFile('before', index)}
						type="file"
						accept=".json,application/json"
						onchange={(e) => handleFile('before', index, e)}
						class="file:bg-primary-700 file:text-white hover:file:bg-primary-800"
					/>
					{#if mode !== 'Guided'}
						<div class="my-2 flex flex-2 flex-row gap-2">
							<Toggle
								size="small"
								bind:checked={device.isGTM}
								onclick={() => (device.isGTM = !device.isGTM)}>BIG-IP GTM Device</Toggle
							>
						</div>
					{/if}
					<div class="mt-2 flex flex-row flex-wrap gap-1">
						<Badge border color={beforeFiles[index]?.required.virtual ? 'green' : 'gray'}
							>Virtual Server</Badge
						>
						<Badge border color={beforeFiles[index]?.required.virtualStats ? 'green' : 'gray'}
							>Virtual Server Stats</Badge
						>
						<Badge border color={beforeFiles[index]?.required.pool ? 'green' : 'gray'}>Pool</Badge>
						<Badge border color={beforeFiles[index]?.required.poolStats ? 'green' : 'gray'}
							>Pool Stats</Badge
						>
						{#if deviceInfo[index].isGTM}
							<Badge border color={beforeFiles[index]?.required.gtmWideIp ? 'green' : 'gray'}
								>GTM WideIp</Badge
							>

							<Badge border color={beforeFiles[index]?.required.gtmWideIpStats ? 'green' : 'gray'}
								>GTM WideIp Stats</Badge
							>

							<Badge
								border
								color={beforeFiles[index]?.required.gtmPoolMembersStats ? 'green' : 'gray'}
								>GTM Pool Member Stats</Badge
							>
						{/if}
					</div>
					<Hr />
				{/each}
			</Card>
			<Card size="xl" class="flex flex-1 flex-col p-4 sm:p-6 md:p-8">
				<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
					Snapshot After Upgrade
				</h5>
				<p class="leading-tight font-normal text-gray-700 dark:text-gray-400">
					Captured after the firmware upgrade
				</p>
				<Hr class="mx-auto my-4 h-1 w-48 rounded-sm md:my-10" />
				{#each deviceInfo as device, index}
					<Label id="event" class="pb-2">Snapshot For Device {device.ip || `#${index + 1}`}</Label>
					<Fileupload
						clearable
						clearableOnClick={() => clearFile('after', index)}
						type="file"
						accept=".json,application/json"
						onchange={(e) => handleFile('after', index, e)}
						class="file:bg-primary-700 file:text-white hover:file:bg-primary-800"
					/>
					{#if mode !== 'Guided'}
						<div class="my-2 flex flex-2 flex-row gap-2"></div>
					{/if}
					<div class="mt-2 flex flex-row flex-wrap gap-1">
						<Badge border color={afterFiles[index]?.required.virtual ? 'green' : 'gray'}
							>Virtual Server</Badge
						>
						<Badge border color={afterFiles[index]?.required.virtualStats ? 'green' : 'gray'}
							>Virtual Server Stats</Badge
						>
						<Badge border color={afterFiles[index]?.required.pool ? 'green' : 'gray'}>Pool</Badge>
						<Badge border color={afterFiles[index]?.required.poolStats ? 'green' : 'gray'}
							>Pool Stats</Badge
						>
						{#if deviceInfo[index].isGTM}
							<Badge border color={afterFiles[index]?.required.gtmWideIp ? 'green' : 'gray'}
								>GTM WideIp</Badge
							>

							<Badge border color={afterFiles[index]?.required.gtmWideIpStats ? 'green' : 'gray'}
								>GTM WideIp Stats</Badge
							>

							<Badge
								border
								color={afterFiles[index]?.required.gtmPoolMembersStats ? 'green' : 'gray'}
								>GTM Pool Member Stats</Badge
							>
						{/if}
					</div>
					<Hr />
				{/each}
			</Card>
		</div>

		<Button disabled={!canCompare || building} aria-busy={building} onclick={compare}
			>{building ? 'Processing…' : 'Compare Before & After Snapshots'}</Button
		>
	</div>
</div>
