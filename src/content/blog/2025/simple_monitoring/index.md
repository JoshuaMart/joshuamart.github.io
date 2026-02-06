---
title: 'Simple Monitoring Solution'
date: 2025-10-01
description: 'Setting up simple monitoring for your services.'
tags: ['devops']
image: '/images/blog/2025/simple_monitoring.png'
---

When you have multiple applications online, there's always that lingering concern in the back of your mind: is everything working properly? And more importantly, how can you be notified quickly if something goes down?

I've always used services offering a free tier. It was more than sufficient for my needs: a simple regular check that told me if my site was online or not, sometimes with a more precise test on a specific page or searching for a keyword in the response. Nothing more.

But recently, the solution I was using decided to discontinue its free plan. The result: users had to either switch to a paid plan or look elsewhere. And while I completely understand that a service can't survive indefinitely hosting only free accounts, their first paid tier was still too expensive for my usage.

I did look at open source alternatives. There are countless options, but they're often too heavy, too complex, and most importantly require separate hosting. And if the monitoring server itself goes down, you're not much better off...

In short, what I needed was a simple and reliable way to verify that my sites are accessible. A check I could customize, without having to manage maintenance, without additional infrastructure... and all at the lowest possible cost.

## Serverless functions?

**Serverless functions** are pieces of code that execute on demand, without having to manage a server. You only pay for the actual code execution time, and most providers (AWS Lambda, Google Cloud Functions, Scaleway Functions, etc.) offer **generous free tiers**:

- Millions of free executions per month
- No cost for idle time
- No infrastructure to maintain

For our use case (checking a few sites every X minutes), we stay **well within the free tier**. Even if you already use serverless functions for other purposes, the execution cost of this script remains **negligible**: a few milliseconds of execution every hour represents a fraction of a cent per month.

## The script

At Scaleway, I created the following script that runs periodically (via a CRON trigger) and checks that my sites are up.

```php
<?php

function handle($event, $context) {
    // --- CONFIGURATION ---
    $config = [
        "discord_webhook" => "https://discord.com/api/webhooks/xxxxxxxxxx/xxxxxxxxxx",
        "sites" => [
        ]
    ];

    // --- Utility Functions ---
    function parse_headers($header_string) {
        $headers = [];
        foreach (explode("\r\n", $header_string) as $line) {
            if (strpos($line, ':') !== false) {
                list($name, $value) = explode(':', $line, 2);
                $headers[strtolower(trim($name))] = trim($value);
            }
        }
        return $headers;
    }

    function send_discord_alert($webhook, $site, $error) {
        $payload = [
            'content' => "🚨 **Issue detected on _{$site}_** :\n{$error}"
        ];
        $ch = curl_init($webhook);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_exec($ch);
        curl_close($ch);
    }

    function check_site($name, $config, $webhook, &$results) {
        $req = $config['request'];
        $res = $config['response'];

        $ch = curl_init($req['url']);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $req['method']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        if (!empty($req['headers'])) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $req['headers']);
        }
        if (!empty($req['body'])) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $req['body']);
        }
        curl_setopt($ch, CURLOPT_HEADER, true);

        $response = curl_exec($ch);
        if ($response === false) {
            send_discord_alert($webhook, $name, "cURL Error: " . curl_error($ch));
            $results[$name] = "cURL Error";
            curl_close($ch);
            return;
        }
        $header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        $headers_str = substr($response, 0, $header_size);
        $body = substr($response, $header_size);
        curl_close($ch);

        // -- HTTP Code Check
        if (isset($res['code']) && intval($res['code']) !== intval($http_code)) {
            send_discord_alert($webhook, $name, "Expected HTTP code: {$res['code']}, received: $http_code");
            $results[$name] = "Expected HTTP code: {$res['code']}, received: $http_code";
            return;
        }

        // -- Headers Check
        if (isset($res['headers']) && is_array($res['headers'])) {
            $headers = parse_headers($headers_str);
            foreach ($res['headers'] as $expected_name => $expected_value) {
                $header_lc = strtolower($expected_name);
                if (!isset($headers[$header_lc])) {
                    send_discord_alert($webhook, $name, "Missing expected header: $expected_name");
                    $results[$name] = "Missing expected header: $expected_name";
                    return;
                }
                if (stripos($headers[$header_lc], $expected_value) === false) {
                    send_discord_alert($webhook, $name, "Header $expected_name found, but expected value missing: {$expected_value} (received value: {$headers[$header_lc]})");
                    $results[$name] = "Header $expected_name found, but expected value missing: {$expected_value} (received value: {$headers[$header_lc]})";
                    return;
                }
            }
        }

        // -- Body Pattern Check
        if (isset($res['body']) && is_array($res['body'])) {
            foreach ($res['body'] as $pattern) {
                if (strpos($body, $pattern) === false) {
                    send_discord_alert($webhook, $name, "Pattern not found in body: $pattern");
                    $results[$name] = "Pattern not found in body: $pattern";
                    return;
                }
            }
        }

        $results[$name] = "OK";
    }

    // --- MAIN ---
    $webhook = $config['discord_webhook'];
    $results = [];

    foreach ($config['sites'] as $name => $site_config) {
        check_site($name, $site_config, $webhook, $results);
    }

    return [
        "statusCode" => 200,
        "body" => json_encode($results)
    ];
}
```

### How does it work?

The script:
1. **Makes an HTTP request** to each configured site (configurable HTTP method)
2. **Verifies** the HTTP code, headers, and response content
3. **Sends a Discord alert** if something is wrong

Here's an example configuration in `"sites"`:

```php
"sites" => [
    "My Blog" => [
        "request" => [
            "url" => "https://myblog.com",
            "method" => "GET"
        ],
        "response" => [
            "code" => 200
        ]
    ],
    "Users API" => [
        "request" => [
            "url" => "https://api.mysite.com/users",
            "method" => "GET",
            "headers" => ["Authorization: Bearer my-token"]
        ],
        "response" => [
            "code" => 200,
            "headers" => [
                "content-type" => "application/json"
            ],
            "body" => ['"status":"ok"']
        ]
    ]
]
```
