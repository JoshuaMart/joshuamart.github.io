#!/usr/bin/env node

/**
 * Generate GitHub Profile README from site data (SSOT)
 * This script reads CVEs and blog posts from src/data/ and src/content/
 * and generates a formatted README.md for the JoshuaMart/JoshuaMart repository
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load CVEs
const cves = JSON.parse(readFileSync(join(rootDir, 'src/data/cves.json'), 'utf-8'));

// Recursively find all .md files in a directory
function findMarkdownFiles(dir, baseDir = dir) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath, baseDir));
    } else if (entry.endsWith('.md')) {
      // Get relative path from base directory for slug generation
      const relativePath = relative(baseDir, fullPath);
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

// Load blog posts from content directory (supports subdirectories)
const blogDir = join(rootDir, 'src/content/blog');
const blogFiles = findMarkdownFiles(blogDir);
const blogPosts = blogFiles.map(({ fullPath, relativePath }) => {
  const content = readFileSync(fullPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const title = frontmatter.match(/title:\s*["'](.+?)["']/)?.[1] || '';
  const dateMatch = frontmatter.match(/date:\s*(.+)/)?.[1] || '';
  const date = new Date(dateMatch);
  // Generate slug from relative path (e.g., "2025/article.md" -> "2025/article")
  const slug = relativePath.replace('.md', '').replace(/\\/g, '/');

  return { title, date, slug };
}).filter(Boolean).sort((a, b) => b.date - a.date);

// Group CVEs by year
const cvesByYear = cves.reduce((acc, cve) => {
  const year = cve.date;
  if (!acc[year]) acc[year] = [];
  acc[year].push(cve);
  return acc;
}, {});

const years = Object.keys(cvesByYear).sort((a, b) => b.localeCompare(a));

// Generate README content
let readme = `<h1 align="center">Hi 👋, I'm Jomar</h1>

<p align="center"><img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=17&pause=1000&color=E84A4A&center=true&multiline=true&random=false&width=435&lines=A+passionate+Research+Engineer+at+Tenable+;and+BugHunter" alt="Typing SVG" /></p>

<p align="center">
  <a href="mailto:contact@jomar.fr">
    <img src="https://img.shields.io/badge/contact@jomar.fr-0078D4?style=for-the-badge&logo=Gmail&logoColor=00AEFF&labelColor=black&color=black">
  </a>
  <a href="https://www.jomar.fr/">
    <img src="https://img.shields.io/badge/-Website-blue?style=for-the-badge&logo=Safari&logoColor=00AEFF&labelColor=black&color=black">
  </a>
  <a href="https://www.linkedin.com/in/joshua-martinelle-a34911133/">
    <img src="https://img.shields.io/badge/-Linkedin-blue?style=for-the-badge&logo=Linkedin&logoColor=00AEFF&labelColor=black&color=black">
  </a>
  <a href="https://x.com/J0_mart">
    <img src="https://img.shields.io/badge/-J0_mart-blue?style=for-the-badge&logo=X&logoColor=00AEFF&labelColor=black&color=black">
  </a>
</p>

<p align="center">
  <a href="https://yeswehack.com/hunters/jomar">YesWeHack</a> •
  <a href="https://app.intigriti.com/profile/jomar">Intigriti</a> •
  <a href="https://pentesterlab.com/profile/J0mar">Pentesterlab</a>
</p>

<p>Hacker at ❤️, I bring my passion for cybersecurity to my work every day. With a background in bugbounty, I have a unique perspective on how to identify and remediate potential threats to systems. I have contributed to several projects, including the development of new open source tools, scripts or the discovery of vulnerabilities.</p>

<h2>🧰 My everyday toolkit</h2>

<p align="center">
  <img src="https://skillicons.dev/icons?i=ruby,rails,php,laravel,go,python,javascript,astro" />
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=bash,docker,git,linux,nginx,postgres,mysql" />
</p>

<h2>📝 Blog Posts & External contribution</h2>

<details>
  <summary>My latest personal blog posts</summary>

`;

// Add blog posts (auto-populated from content)
blogPosts.forEach(post => {
  readme += `  * [${post.title}](https://jomar.fr/blog/${post.slug}/)\n`;
});

readme += `</details>

<details>
  <summary>Tenable Blog</summary>

  * [Bypass a Patch for BentoML's Server-Side Request Forgery Vulnerability CVE-2025-54381](https://www.tenable.com/blog/how-tenable-bypassed-patch-for-bentoml-ssrf-vulnerability-CVE-2025-54381)
  * [Identifying Web Cache Poisoning and Web Cache Deception](https://www.tenable.com/blog/identifying-web-cache-poisoning-and-web-cache-deception-how-tenable-web-app-scanning-can-help)
  * [Password Management and Authentication Best Practices](https://www.tenable.com/blog/password-management-and-authentication-best-practices)
  * [Identifying XML External Entity](https://www.tenable.com/blog/identifying-xml-external-entity-how-tenable-io-web-application-scanning-can-help)
  * [Identifying Server Side Request Forgery](https://www.tenable.com/blog/identifying-server-side-request-forgery-how-tenable-io-web-application-scanning-can-help)
</details>

<details>
  <summary>Tenable Medium</summary>

  * [CVE-2024–8182 : Accidental Discovery of an Unauthenticated DoS](https://medium.com/tenable-techblog/cve-2024-8182-accidental-discovery-of-an-unauthenticated-dos-1d89947a09a4)
  * [Solidus — Code Review](https://medium.com/tenable-techblog/solidus-code-review-7e9b606a5c10)
  * [WordPress MyCalendar Plugin — Unauthenticated SQL Injection(CVE-2023–6360)](https://medium.com/tenable-techblog/wordpress-mycalendar-plugin-unauthenticated-sql-injection-cve-2023-6360-d272887ddf12)
  * [WordPress BuddyForms Plugin — Unauthenticated Insecure Deserialization (CVE-2023–26326)](https://medium.com/tenable-techblog/wordpress-buddyforms-plugin-unauthenticated-insecure-deserialization-cve-2023-26326-3becb5575ed8)
  * [Multiples WordPress plugins CVE analysis](https://medium.com/tenable-techblog/multiples-wordpress-plugins-cve-analysis-28843a8b8fd0)
  * [Wordpress 6.0.3 Patch Analysis](https://medium.com/tenable-techblog/wordpress-6-0-3-patch-analysis-6a2c0707cda6)
</details>

<details>
  <summary>BugBountyHunter Website</summary>

  * [Mass assignment and learning new things](https://www.bugbountyhunter.com/articles/?on=mass-assignment-and-learning-new-things)
  * [My Methodology during Firstblood](https://www.bugbountyhunter.com/articles/?on=firstbloodhackers)
</details>

<details>
  <summary>Synetis Blog</summary>

  * [AMSI et Antivirus : des protections loin d'être suffisantes !](https://www.synetis.com/amsi-antivirus/)
  * [Gestion des mots de passe côté backend, Hash & Assaisonnement !](https://www.synetis.com/gestion-mdp/)
  * [Illustrations d'attaques sur le wifi](https://www.synetis.com/illustrations-dattaques-sur-le-wifi/)
</details>

<h2>🏆 CVE & Security Research</h2>

`;

// Add CVEs by year
years.forEach(year => {
  readme += `<details>\n  <summary>${year}</summary>\n\n`;
  cvesByYear[year].forEach(cve => {
    readme += `  * [${cve.id}](${cve.link}) - ${cve.type} in [${cve.target}](${cve.link})\n`;
  });
  readme += `</details>\n\n`;
});

readme += `<h2>📊 Github Statistics</h2>

![Stats](./profile/stats.svg)
`;

// Write output
const outputPath = join(rootDir, 'dist/github-profile-readme.md');
writeFileSync(outputPath, readme);
console.log(`✅ GitHub profile README generated: ${outputPath}`);
