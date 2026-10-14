<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Card, Button, Heading, P } from 'flowbite-svelte';
	import { CheckCircleSolid, ExclamationCircleOutline } from 'flowbite-svelte-icons';
</script>

<div class="mx-auto max-w-screen-xl px-4 py-8 lg:px-6 lg:py-16">
	<div class="text-center">
		<Heading tag="h6" class="mb-4">F5 BIG-IP firmware upgrade assistant</Heading>
		<Heading tag="h2" class="mb-4 text-2xl font-extrabold  md:text-2xl lg:text-5xl">
			Verify your upgrade didt break anything.</Heading
		>
		<P class="mb-6 text-center text-lg sm:px-16 lg:text-xl xl:px-48 dark:text-gray-400">
			Capture virtual server, pool and member status before and after a firmware upgrade, then
			instantly spot any regressions.
		</P>
	</div>

	<div class="space-y-8 sm:gap-6 lg:grid lg:grid-cols-2 lg:space-y-0 xl:gap-10">
		<Card size="lg" class="mx-auto p-4 text-center sm:p-8 md:p-10">
			<h5 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">Online Mode</h5>
			<p class="mb-5 text-base text-gray-500 sm:text-lg dark:text-gray-400">
				Live connection to your F5 device
			</p>
			<div class="mb-5 text-left text-base text-gray-500 sm:text-lg dark:text-gray-400">
				<div class="flex space-x-2 rtl:space-x-reverse">
					<CheckCircleSolid class="h-4 w-4 text-primary-600 dark:text-primary-500" />
					<span class="text-base leading-tight font-normal text-gray-500 dark:text-gray-400"
						>Enter device IP, username & password</span
					>
				</div>
				<div class="flex space-x-2 rtl:space-x-reverse">
					<CheckCircleSolid class="h-4 w-4 text-primary-600 dark:text-primary-500" />
					<span class="text-base leading-tight font-normal text-gray-500 dark:text-gray-400"
						>Test connectivity before capturing</span
					>
				</div>
				<div class="flex space-x-2 rtl:space-x-reverse">
					<CheckCircleSolid class="h-4 w-4 text-primary-600 dark:text-primary-500" />
					<span class="text-base leading-tight font-normal text-gray-500 dark:text-gray-400"
						>One-click snapshot — before & after</span
					>
				</div>
			</div>
			<div
				class="items-center justify-center space-y-4 sm:flex sm:space-y-0 sm:space-x-4 rtl:space-x-reverse"
			>
				<Button disabled>
					<ExclamationCircleOutline class="h-6 w-6 shrink-0" />
					Connect to F5</Button
				>
			</div>
		</Card>
		<Card size="lg" class="mx-auto p-4 text-center sm:p-8 md:p-10">
			<h5 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">Local Mode</h5>
			<p class="mb-5 text-base text-gray-500 sm:text-lg dark:text-gray-400">
				Upload JSON exports for offline analysis
			</p>
			<div class="mb-5 text-left">
				<div class="flex space-x-2 rtl:space-x-reverse">
					<CheckCircleSolid class="h-4 w-4 text-primary-600 dark:text-primary-500" />
					<span class="text-base leading-tight font-normal text-gray-500 dark:text-gray-400"
						>Upload VS stats, pool stats, VS config, pool config</span
					>
				</div>
				<div class="flex space-x-2 rtl:space-x-reverse">
					<CheckCircleSolid class="h-4 w-4 text-primary-600 dark:text-primary-500" />
					<span class="text-base leading-tight font-normal text-gray-500 dark:text-gray-400"
						>Works fully offline — no device access needed</span
					>
				</div>
				<div class="flex space-x-2 rtl:space-x-reverse">
					<CheckCircleSolid class="h-4 w-4 text-primary-600 dark:text-primary-500" />
					<span class="text-base leading-tight font-normal text-gray-500 dark:text-gray-400"
						>Great for post-upgrade audits & reports</span
					>
				</div>
			</div>
			<div
				class="items-center justify-center space-y-4 sm:flex sm:space-y-0 sm:space-x-4 rtl:space-x-reverse"
			>
				<Button onclick={() => goto(resolve('local'))}>Upload JSON files</Button>
			</div>
		</Card>
	</div>
</div>
