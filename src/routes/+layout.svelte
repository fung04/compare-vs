<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { Navbar, NavBrand, NavHamburger, DarkMode } from 'flowbite-svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<header
	class="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/90"
>
	<Navbar class="bg-transparent dark:bg-transparent">
		<NavBrand href="/">
			<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white"
				>compare.vs</span
			>
		</NavBrand>
		<div class="flex items-center gap-1 lg:order-2">
			<DarkMode />
			<NavHamburger />
		</div>
	</Navbar>
</header>

<main class="min-h-[calc(100vh-65px)]">
	{@render children()}
</main>
