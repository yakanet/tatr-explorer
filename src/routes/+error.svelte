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
		max-width: 34rem;
		margin: 0 auto;
		padding: 4rem 1.5rem;
	}

	h1 {
		margin: 0 0 0.75rem;
		font-size: 1.5rem;
		font-weight: 800;
	}
</style>
