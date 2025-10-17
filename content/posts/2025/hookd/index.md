---
title: "Hookd: A Lightweight Out-of-Band Interaction Server"
date: 2025-10-17T21:00:00+01:00
description: "Building a memory-efficient OOB interaction server to handle millions of requests per day"
---

Out-of-band (OOB) interaction servers have become essential tools in security testing workflows. Whether you're hunting for blind vulnerabilities, testing SSRF, or tracking DNS exfiltration, having a reliable interaction server is crucial.

For years, I've relied on [Interactsh](https://github.com/projectdiscovery/interactsh) by ProjectDiscovery. It's an excellent tool that has served me well, and I even developed a Ruby client library for it: [Interactsh-Library](https://github.com/JoshuaMart/Interactsh-Library). However, as my usage grew, I started encountering serious memory consumption issues, server freezes and even crashes. This problem is [well-documented](https://github.com/projectdiscovery/interactsh/issues/824) but remains unresolved.

The alternative ? BurpCollaborator. While it's a solid solution, it's officially only usable within Burp Suite. Sure, people have reverse-engineered it and created scripts to use it externally, but every Burp update risks breaking these workarounds.

Other solutions exist, but without listing them all, the main problem remains the fact of managing millions of requests per day without flinching.

That's when I decided to build my own solution.

## Why Hookd?

I needed an OOB server that could:
- Handle millions of requests per day
- Consume minimal memory (just a few dozen MB)
- Remain stable under heavy load
- Be simple to deploy and maintain

This is how [Hookd](https://github.com/JoshuaMart/Hookd) was born, a lightweight, high-performance interaction server written in Go for capturing DNS queries and HTTP requests.

## Architecture and Key Features

Hookd follows a straightforward architecture with three main components:

**The Server**

The core server is a single Go binary that provides:
- DNS server listening on port 53
- HTTP/HTTPS server with wildcard virtual hosts
- RESTful API for hook management
- Automatic Let's Encrypt TLS certificate provisioning
- Built-in metrics and structured logging

**Memory Efficiency Through Smart Eviction**

The real plus in Hookd lies in its multi-strategy eviction system. Unlike other solutions that can accumulate interactions indefinitely, Hookd implements four complementary eviction strategies:

1. **TTL-based removal**: Interactions automatically expire after a configurable time
2. **Hook expiration**: Hooks themselves have a maximum lifetime
3. **Per-hook limits**: FIFO eviction when a single hook accumulates too many interactions
4. **Memory pressure eviction**: Automatic cleanup at 90% memory capacity

This ensures that even under extreme load, the server maintains a stable memory footprint.

**Client Libraries**

To make integration seamless, I built a Ruby client that handles all the API communication. The library provides a simple interface for registering hooks and polling for interactions:

```ruby
require 'hookd'

client = Hookd::Client.new(
  server: "https://hookd.example.com",
  token: ENV['HOOKD_TOKEN']
)

# Register a new hook
hook = client.register

puts "DNS endpoint: #{hook.dns}"
puts "HTTP endpoint: #{hook.http}"
puts "HTTPS endpoint: #{hook.https}"

# Poll for interactions
interactions = client.poll(hook.id)
interactions.each do |interaction|
  if interaction.dns?
    puts "DNS Query: #{interaction.data['query']}"
  elsif interaction.http?
    puts "HTTP Request: #{interaction.data['method']} #{interaction.data['path']}"
  end
end
```

The client handles authentication, error management, and provides convenient methods for working with hooks and interactions.

## Deployment and Configuration

One of Hookd's strengths is its simplicity. The entire server is a single binary with YAML configuration:

```yaml
domain: hookd.example.com
dns:
  port: 53
http:
  port: 80
https:
  port: 443
  autocert:
    enabled: true
    cache_dir: /var/lib/hookd/certs

api:
  token: "your-secret-token"

eviction:
  interaction_ttl: 1h
  hook_ttl: 24h
  max_interactions_per_hook: 1000
  memory_threshold_percent: 90
```

Deployment is straightforward:

1. Download the pre-compiled binary for your platform
2. Create the configuration file
3. Run the server (requires root or `CAP_NET_BIND_SERVICE` for port 53/80/443)

For production use, a systemd service ensures automatic startup and restart on failure.

## API Endpoints

Hookd exposes a minimal API surface:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/register` | POST | Create new hooks with DNS/HTTP endpoints |
| `/poll/:id` | GET | Retrieve and delete interactions for a hook |
| `/metrics` | GET | Access server statistics (no auth required) |

The `/register` endpoint supports bulk creation - you can request multiple hooks in a single call, which is particularly useful for distributed testing scenarios.

The `/poll` endpoint follows a consume-on-read pattern: interactions are deleted when retrieved, preventing memory accumulation and ensuring privacy.

## Real-World Performance

Since deploying Hookd in production, the results have been impressive:

- **Stable memory usage**: Consistently under 50MB even with thousands of active hooks
- **High throughput**: Handles dozens of requests per second without breaking a sweat
- **Zero crashes**: The eviction strategies prevent the memory issues I experienced with other solutions
- **Low latency**: DNS responses in milliseconds, HTTP endpoints responding instantly

The metrics endpoint provides real-time visibility into server health:

```json
{
  "active_hooks": 1247,
  "total_interactions": 38492,
  "memory": {
    "heap_alloc_mb": 42.3,
    "sys_mb": 67.8
  },
  "evictions": {
    "ttl": 15234,
    "memory_pressure": 0,
    "per_hook_limit": 89
  }
}
```

## The Open Source Journey

After using Hookd privately for several weeks, I recently decided to make it [publicly available on GitHub](https://github.com/JoshuaMart/Hookd). The project is released under the MIT license, encouraging others to use, modify, and contribute.

The repository includes:
- Complete server source code
- Ruby client library
- Configuration examples
- Deployment guides
- API documentation

If you're facing similar memory issues with existing OOB servers, or if you're looking for a lightweight alternative that's easy to deploy and maintain, Hookd might be worth checking out.

## Future Improvements

While Hookd is production-ready, there are several enhancements I'm considering:

- Additional client libraries (Python, Go)
- SMTP server for email interactions
- WebSocket support for real-time notifications
- Enhanced filtering and search capabilities
- Webhook notifications when interactions are received

The modular architecture makes these additions straightforward without compromising the core simplicity and performance.

## Conclusion

Building Hookd taught me that sometimes the best solution is the one you build yourself. While there are excellent OOB interaction tools available, having specific requirements around memory usage and stability led me to create something tailored to my needs.

The result is a lightweight, efficient, and reliable interaction server that handles millions of requests with minimal resources. Whether you're a bug bounty hunter, penetration tester, or security researcher, having a stable OOB server in your toolkit is invaluable.

If you're interested in trying Hookd or contributing to the project, check out the [GitHub repository](https://github.com/JoshuaMart/Hookd). The complete documentation, including setup guides and API references, is available in the READMEs.

*Happy hunting!*
