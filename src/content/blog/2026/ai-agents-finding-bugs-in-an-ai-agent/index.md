---
title: 'AI agents finding bugs in an AI agent'
date: 2026-10-12
description: 'With the help of an agent, I found four vulnerabilities in the Hermes Agent dashboard, all reachable without an account. The most serious one leads to a session takeover because Python and the browser do not parse the same URL the same way.'
tags: ['ai', 'bugbounty']
image: '/images/blog/2026/ai-agents-finding-bugs-in-an-ai-agent.jpg'
---

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is an open source AI agent developed by Nous Research. It comes with a web dashboard, and depending on what is enabled, a logged-in user can reach the configuration, the files and a terminal from it. So I wanted to know what someone could do there without an account.

I did this audit with the help of an agent. An AI agent looking for bugs in another AI agent, I found the idea funny enough to make it the title.

I won't go into the details of the setup. I'm testing a lot of things in parallel at the moment, a custom harness of my own but also Codex and Claude Code, and it's too early to say much about it.

## The routes reachable without authentication

The authentication middleware lets a few routes through without a session: `/auth/password-login`, `/auth/native/token`, `/auth/native/refresh`, and the native authorization flow under `/auth/native/authorize`. Everything else requires a session, so these routes were the first thing to look at, and the four findings are all in them.

None of them is complicated. Each time, code that anyone can reach does something without a limit: the number of attempts it accepts, the amount it writes to disk, the amount it reads into memory, or the place it redirects the browser to.

## Rate limit bypass with X-Forwarded-For

The password login is limited to ten attempts per minute per client. To check it without testing a real password, I sent the same request with a provider that does not exist: ten `404`, then a `429` on the eleventh. Changing only the `X-Forwarded-For` header was enough to get a `404` again.

The reason is in the function that picks the client address:

```python
def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""
```

The first value of the header is used as is, whoever sent it. If the dashboard is reached directly, or through a proxy that does not replace the header, each client can pick its own bucket.

I was not the first on this one: someone had already opened [PR #40285](https://github.com/NousResearch/hermes-agent/pull/40285) on June 6. That PR was not merged, and the fix finally landed on October 5 with [PR #133367](https://github.com/NousResearch/hermes-agent/pull/133367).

On its own, it makes brute force easier. It also makes the next one worse.

## Filling the disk through the audit log

When the login names a provider that does not exist, Hermes returns a `404`, but before that it writes the failed attempt to `dashboard-auth.log`, with the `provider` value. This field has no maximum length, and the audit logger filters some sensitive field names but never limits the size of what it writes.

I sent a provider of about 4 million characters and got a `404`, while the free space reported by `/api/status` went from 923 MB to 919 MB. Then a single request of exactly 100 MiB: still a `404`, and the free space went from 919 MB to 819 MB. No account was needed, and the data stays in the log after the request.

It is the easiest of the four to exploit. Each request adds a new entry, the response looks like any failed login, and the only limit on repetition was the rate limit from the previous section, which the attacker controls with a header. Once the disk is full, everything on the server that needs to write is affected, Hermes included.

## Memory exhaustion with large request bodies

The same public routes accept JSON bodies of any size. The web stack (FastAPI, Starlette and Uvicorn) reads the whole body before the handler runs, so a request is rejected only after it has been loaded into memory. Uvicorn is configured with a limit for WebSocket messages, but none for HTTP bodies.

I first sent a 1 MB body to `/auth/native/refresh` and got a `401` instead of a `413`. With chunked encoding and no `Content-Length`, bodies of 32 MiB and then 128 MiB still reached the login handler. Finally, I kept eight 32 MiB uploads open at the same time for fifteen seconds, and the process memory went from 721 MiB to 1.08 GiB.

How far this goes depends on the server hosting the dashboard and how much memory it has. The fix is to reject oversized bodies before parsing, and to count the bytes actually received so that chunked requests cannot get around the check.

## Session takeover through redirect URI parsing

This is the most serious of the four.

Native clients log in with a PKCE flow. The client opens `/auth/native/authorize` with a `code_challenge` and a `redirect_uri`, the user signs in, and the dashboard redirects the browser to that URI with a one-time `code`. The client then exchanges this code and its `code_verifier` for tokens.

Since the code is sent wherever `redirect_uri` points, Hermes only accepts loopback addresses, and the comment in the validation function says why: a remote origin would receive a live authorization code. The function parses the value with `urllib.parse.urlparse`, checks that `hostname` is a loopback address, and then returns the original string instead of the parsed one. This string is stored, the code is appended to it after login, and the page redirects the browser there with `window.location.assign`.

The problem is that Python and the browser do not read this URL the same way:

```python
>>> from urllib.parse import urlparse
>>> u = urlparse(r"http://attacker.example\@127.0.0.1:27777/callback")
>>> u.hostname, u.port
('127.0.0.1', 27777)
```

```js
> const u = new URL("http://attacker.example\\@127.0.0.1:27777/callback")
> [u.host, u.pathname]
[ 'attacker.example', '/@127.0.0.1:27777/callback' ]
```

`urlparse` treats everything before the `@` as user information, backslash included, so for Python the host is `127.0.0.1`. The browser follows the WHATWG URL spec, where a backslash in an HTTP URL is a path separator, so the host ends before it and the `@` becomes part of the path.

From there, the attack goes like this:

1. The attacker picks a `code_verifier`, computes its challenge, and builds an authorization URL with a `redirect_uri` that puts their host before `\@127.0.0.1`.
2. The server sees a loopback address and binds the pending authorization to the attacker's challenge.
3. The victim opens the link and signs in on the real Hermes page.
4. The browser follows the redirect to the attacker's host, with the code in the query string.
5. The attacker exchanges the code with the verifier they chose at step 1 and receives the victim's access and refresh tokens.

PKCE does not protect against this. It proves that whoever redeems the code also started the flow, and here the attacker started it. With the stolen token I could read `/api/config` with the victim's privileges, and the token gives access to everything the dashboard exposes to that session, terminal included when it is enabled.

To fix this kind of bug, the URL you use has to be the one you checked: parse it, reject user information, backslashes and control characters, then build a new URL from the validated parts and store only that one.

I was not the first on this one either. The same issue had been identified in [PR #130685](https://github.com/NousResearch/hermes-agent/pull/130685) four days before my report was picked up, and it was fixed in that pull request.

## Disclosure

All of these are fixed in [Hermes Agent 0.21.6](https://github.com/NousResearch/hermes-agent/releases/tag/v0.21.6). The advisories are on Tenable's website:

* [TRA-2026-63](https://www.tenable.com/security/research/tra-2026-63): pre-authentication memory exhaustion
* [TRA-2026-64](https://www.tenable.com/security/research/tra-2026-64): pre-authentication disk consumption
* [TRA-2026-65](https://www.tenable.com/security/research/tra-2026-65): PKCE session takeover via redirect URI parser confusion

Thanks to Mark from Nous Research, who was very responsive once he took over the contact with me.

## What's next

If your Hermes dashboard is reachable from the network, make sure it runs 0.21.6 or later.

Hermes is not the only agent I have looked at this way, and a similar article about another agent should be out soon.
