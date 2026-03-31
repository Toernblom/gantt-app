import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		watch: {
			// Ignore project data files so saving a project inside the app dir doesn't trigger HMR
			ignored: ['**/project.json', '**/.ganttapp'],
		},
	},
});
