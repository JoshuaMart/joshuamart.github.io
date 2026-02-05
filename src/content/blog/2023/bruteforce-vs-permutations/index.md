---
title: 'Bruteforce vs Permutations'
date: 2023-05-27
description: 'Comparing subdomain bruteforce and permutation techniques using Regulator, DNSGen, and AlterX to find the most effective reconnaissance strategy.'
tags: ['bugbounty', 'recon', 'dns', 'subdomain']
image: '/images/blog/2023/bruteforce-vs-permutations.png'
---

## Introduction

In this article, we'll compare which is more interesting between bruteforce or permutation generation. But also, if it's always worth.
For the analysis, it doesn't matter which domain is used, we'll call it `domain.tld`. I chose this scope because it's a program I'm fairly familiar with, and so it was easier for me to compare the results obtained.

Before getting to the heart of the matter, I'd like to point out that for each step requiring DNS resolution, I used a different VPS for each tool in order to be on the soundest possible footing for each test.

Also, I think there are several ways of studying the results obtained, but for my test I preferred to focus on the number of reachable URLs I get at the end.
The most important thing is that the test protocol is the same between the tools

## Initial enumeration

For the initial enumeration of subdomains I used [Subfinder](https://github.com/projectdiscovery/subfinder/) in version 2.5.8 and configured the following API keys :
* binaryedge / censys / chaos / passivetotal / securitytrails / whoisxmlapi

```
root@scw-great-galileo:~# subfinder -d domain.tld -all -o subfinder.txt
[...]
[INF] Found 10288 subdomains for domain.tld in 17 seconds 871 milliseconds
```

Subfinder gives us 10288 sub-domains, but I know that my target doesn't actually have even 10% of what is advertised as alive or exposed.

For subdomain resolution, I use [PureDNS](https://github.com/d3mondev/puredns), if you want more information, I refer you to [my other article which compares DNS resolution tools](/blog/2022/dns-tools-comparison/).
In my case, I use two DNS resolver wordlists:

* Resolvers : https://raw.githubusercontent.com/trickest/resolvers/main/resolvers.txt
* Resolvers Trusted : https://raw.githubusercontent.com/trickest/resolvers/main/resolvers-trusted.txt

```
root@scw-great-galileo:~# puredns resolve subfinder.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write subfinder_resolved.txt
# less than 1 min later
root@scw-great-galileo:~# wc -l subfinder_resolved.txt
667 puredns_resolved.txt
```

More than 667 hostnames, that already seems more consistent with what I know about the target, so we can now compare what is more effective between bruteforce and permutations.

## Bruteforce

I've recently started using the [n0kovo_subdomains wordlist](https://github.com/n0kovo/n0kovo_subdomains). The author has written [a very good blog post detailing the creation of this wordlist](https://n0kovo.github.io/posts/subdomain-enumeration-creating-a-highly-efficient-wordlist-by-scanning-the-entire-internet/), which I invite you to read.
* Bruteforce Wordlist : https://raw.githubusercontent.com/n0kovo/n0kovo_subdomains/main/n0kovo_subdomains_huge.txt

So we end up with a 50M wordlist, then the process is quite simple :

1. We bruteforce the subdomains with PureDNS
2. We combine the initial result of Subfinder with the result obtained
3. We run Naabu on all subdomains with the `-top-ports 100` option and a few exclusions
4. Then retrieve the list of all URLs with HTTPX

```
root@scw-great-galileo:~# du -h n0kovo_subdomains_huge.txt
50M	n0kovo_subdomains_huge.txt
root@scw-great-galileo:~# puredns bruteforce n0kovo_subdomains_huge.txt domain.tld --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write puredns_brute.txt
# A few minutes later
root@scw-great-galileo:~# wc -l puredns_brute.txt
201 puredns_brute.txt
root@scw-great-galileo:~# cat puredns_brute.txt subfinder_resolved.txt | sort -u > all.txt && wc -l all.txt
673 all.txt
root@scw-great-galileo:~# naabu -l all.txt -tp 100 -ep 22,25,53,110,587,465,995 -ec -silent | httpx -silent -timeout 10 -o httpx.txt
[...]
root@scw-great-galileo:~# wc -l httpx.txt
717 httpx.txt
```

After a bruteforce phase, we end up with 717 reachable URLs. Comparing now this result with the permutation

## Permutations

I didn't want to compare all existing tools, so I chose 3 of them :
* [Regulator](https://github.com/cramppet/regulator) : Intelligent wordlist creation
* [DNSGen](https://github.com/ProjectAnte/dnsgen) : The safe bet
* [AlterX](https://github.com/projectdiscovery/alterx) : The new kid on the block

Let's start with Regulator, the permutation tool I've been using up until now, because I find it offers a smarter approach to wordlist creation, allowing a good balance between the size of the final wordlist and the results.

```
root@scw-funny-galois:~/regulator# python3 main.py -t domains.txt -f subfinder_resolved.txt -o regulator.txt
root@scw-funny-galois:~/regulator# du -h regulator.txt
788K	regulator.txt
root@scw-funny-galois:~# puredns resolve regulator.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write puredns_regulator_resolved.txt
# 1 min later
root@scw-funny-galois:~# wc -l puredns_regulator_resolved.txt
651 puredns_regulator_resolved.txt
root@scw-funny-galois:~# cat puredns_regulator_resolved.txt subfinder_resolved.txt | sort -u > all.txt && wc -l all.txt
702 all.txt
root@scw-funny-galois:~# naabu -l all.txt -tp 100 -ep 22,25,53,110,587,465,995 -ec -silent | httpx -silent -timeout 10 -o httpx.txt
root@scw-funny-galois:~# wc -l httpx.txt
745 httpx.txt
```

We can see that with a wordlist of not even 1M, we end up with 745 URLs, i.e. already 28 more than via the bruteforce phase.

AlterX is the new kid on the block. Recently released by ProjectDiscovery, I was eager to measure it against the others.
```
root@scw-great-hugle:~# alterx -l subfinder_resolved.txt -enrich -o alterx.txt
[...]
[INF] Generated 2359334 permutations in 14.5506s
root@scw-great-hugle:~# du -h alterx.txt
86M	alterx.txt
root@scw-great-hugle:~# puredns resolve alterx.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write puredns_alterx_resolved.txt
# A few minutes later
root@scw-great-hugle:~# wc -l puredns_alterx_resolved.txt
264 puredns_alterx_resolved.txt
root@scw-great-hugle:~# cat puredns_alterx_resolved.txt subfinder_resolved.txt | sort -u > all.txt && wc -l all.txt
702 all.txt
root@scw-great-hugle:~# naabu -l all.txt -tp 100 -ep 22,25,53,110,587,465,995 -ec -silent | httpx -silent -timeout 10 -o httpx.txt
[...]
root@scw-great-hugle:~# wc -l httpx.txt
754 httpx.txt
```

This generates a solid wordlist of almost 90M, giving us 754 URLs, 37 more than bruteforce and 9 more than Regulator.

And now DNSGen, which needs no introduction, generates a huge wordlist of 267M !

```
root@scw-sleepy-jepsen:~# dnsgen subfinder_resolved.txt > dnsgen.txt
root@scw-sleepy-jepsen:~# du -h dnsgen.txt
267M	dnsgen.txt
root@scw-sleepy-jepsen:~# puredns resolve dnsgen.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write puredns_dnsgen_resolved.txt
# 45 min later
root@scw-sleepy-jepsen:~# wc -l puredns_dnsgen_resolved.txt
7381 puredns_dnsgen_resolved.txt
root@scw-sleepy-jepsen:~# cat puredns_dnsgen_resolved.txt subfinder_resolved.txt | sort -u > all.txt && wc -l all.txt
719 all.txt
root@scw-sleepy-jepsen:~# naabu -l all.txt -tp 100 -ep 22,25,53,110,587,465,995 -ec -silent | httpx -silent -timeout 10 -o httpx.txt
root@scw-sleepy-jepsen:~# wc -l httpx.txt
766 httpx.txt
```

DNSGen offers the best results, with 49 more subdomains than bruteforce and 12 more than AlterX. I should point out, however, that since the wordlist is much larger, the resolution is also much longer. In addition, I've observed that DNSGen generates a lot of duplicate results which must be filtered before DNS resolution.

## Bruteforce & Permutations

The last case I wanted to test was the bruteforce + permutation combination. For the permutation, I chose to keep AlterX, because in my case, it offers the best wordlist/time/results ratio.

```
root@scw-eloquent-jennings:~# cat puredns_brute.txt puredns_resolved.txt | sort -u > puredns.txt && wc -l puredns.txt
673 puredns.txt
root@scw-eloquent-jennings:~# alterx -l puredns.txt -enrich -o alterx.txt
[...]
[INF] Generated 2194873 permutations in 13.2692s
root@scw-eloquent-jennings:~# puredns resolve alterx.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write puredns_alterx_resolved.txt
# A few minutes later
root@scw-eloquent-jennings:~# wc -l puredns_alterx_resolved.txt
298 puredns_alterx_resolved.txt
root@scw-eloquent-jennings:~# cat puredns_alterx_resolved.txt puredns_resolved.txt | sort -u > all.txt && wc -l all.txt
709 all.txt
root@scw-eloquent-jennings:~# naabu -l all.txt -tp 100 -ep 22,25,53,110,587,465,995 -ec -silent | httpx -silent -timeout 10 -o httpx.txt
[...]
root@scw-eloquent-jennings:~# wc -l httpx.txt
767 httpx.txt
```

We therefore end up with a final URL list of 767, which is better than bruteforce or permutation independently.

## To be taken into account

If you look all my tests, you'll see that I've been constantly monitoring the weight of the wordlist, and not for nothing. Whereas on a bruteforce it will be constant, with a permutation wordlist it will depend on the target.
It's important to bear in mind that even with a high-performance machine, if your target has a large number of sub-domains, your wordlist is likely to be very large. Here, I'm using a 4-Core VPS with 8GB RAM.

Apple :
```
root@scw-eloquent-jennings:~# subfinder -d apple.com -all -o apple.txt
[INF] Found 36437 subdomains for apple.com in 10 minutes 195 milliseconds
root@scw-eloquent-jennings:~# puredns resolve apple.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write apple_resolved.txt
root@scw-eloquent-jennings:~# wc -l apple_resolved.txt
19320 apple_resolved.txt
```

Subfinder detects around 36,000 domains; after resolution with PureDNS, 19320 remain.
I was unable to generate a wordlist with either AlterX or Regulator, the former freezes after a while and doesn't seem to do anything, while the second crashes.

Ford :
```
root@scw-thirsty-wiles:~# subfinder -d ford.com -all -o ford.txt
[...]
[INF] Found 27181 subdomains for ford.com in 30 seconds 317 milliseconds
root@scw-thirsty-wiles:~# puredns resolve ford.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write ford_resolved.txt
root@scw-thirsty-wiles:~# wc -l ford_resolved.txt
8996 ford_resolved.txt
```

Subfinder detects around 27,000 domains; after resolution with PureDNS, 8996 remain.
Same as Apple, I was unable to generate a wordlist with either AlterX or Regulator, the former freezes after a while and doesn't seem to do anything, while the second crashes.

Sony :
```
root@scw-thirsty-wiles:~# subfinder -d sony.com -all -o sony.txt
[...]
[INF] Found 14708 subdomains for sony.com in 30 seconds 432 milliseconds
root@scw-thirsty-wiles:~# puredns resolve sony.txt --resolvers resolvers.txt --resolvers-trusted resolvers-trusted.txt --write sony_resolved.txt
root@scw-thirsty-wiles:~# wc -l sony_resolved.txt
2462 sony_resolved.txt
root@scw-thirsty-wiles:~# alterx -l sony_resolved.txt -enrich -o alterx_sony.txt
[...]
[INF] Generated 37096251 permutations in 527.1128s
root@scw-thirsty-wiles:~# du -h alterx_sony.txt
1.3G	alterx_sony.txt
```

Subfinder detects around 15,000 domains; after resolution with PureDNS, 2462 remain. This time we managed to generate a wordlist with AlterX in 527 seconds, and the wordlist is 1.3GB in size !
I did the same test for Sony, albeit with a 2core / 2Gb VPS, and in this case, as with Apple & Ford, AlterX remains blocked.

## Conclusion

The right solution doesn't exist: it depends on what you want to do, and how comprehensive you want your results to be.
Generally speaking, however, for automation purposes, the bruteforce + permutations combo with AlterX seems to me to be a good compromise, although you should make sure that your VPS is powerful enough.
