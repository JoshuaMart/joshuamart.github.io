// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.jomar.fr',
  markdown: { shikiConfig: { theme: 'github-light' } },
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [icon(), sitemap()]
});
