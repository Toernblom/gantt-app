/// <reference types="node" />
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	clearScreen: false,
	server: {
		...(isTauri && { strictPort: true, port: 5173 }),
		watch: {
			// Ignore project data files so saving a project inside the app dir doesn't trigger HMR
			ignored: ['**/project.json', '**/.ganttapp'],
		},
	},
	...(isTauri && {
		envPrefix: ['VITE_', 'TAURI_ENV_'],
	}),
});
