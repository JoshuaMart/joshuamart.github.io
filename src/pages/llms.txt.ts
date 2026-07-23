import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { siteConfig } from '../data/site';

// Curated "menu" for AI engines (llms.txt). Auto-generated at build time from
// the blog collection so it never goes stale. Format: H1 + blockquote summary +
// sections of links with descriptions (https://llmstxt.org).
export const GET: APIRoute = async () => {
  const base = siteConfig.siteUrl.replace(/\/$/, '');
  const url = (path: string) => new URL(path, base + '/').href;

  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  const pages = [
    { path: '/cves', label: 'CVEs', note: 'Disclosed vulnerabilities and advisories' },
    { path: '/blog', label: 'Blog', note: 'Security research, bug bounty and write-ups' },
    { path: '/tools', label: 'Tools', note: 'Open-source recon and security tooling' },
  ];

  const lines = [
    `# ${siteConfig.name}`,
    '',
    `> ${siteConfig.description}`,
    '',
    '## Pages',
    ...pages.map((p) => `- [${p.label}](${url(p.path)}): ${p.note}`),
    '',
    '## Blog posts',
    ...posts.map(
      (post) => `- [${post.data.title}](${url(`/blog/${post.id}/`)}): ${post.data.description}`
    ),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
