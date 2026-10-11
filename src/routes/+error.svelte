<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<main>
	<h1>{page.status}</h1>
	<p>{page.error?.message ?? 'Something went wrong.'}</p>
	<p><a href={resolve('/')}>Back to the repository picker</a></p>
</main>

<style>
	main {
		--column: 34rem;
		padding-block: 4rem;
	}

	h1 {
		margin: 0 0 0.75rem;
		font-size: 1.5rem;
		font-weight: 800;
	}
</style>
