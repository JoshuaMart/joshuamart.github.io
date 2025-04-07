---
title: "Extract and monitor bugbounty scopes"
date: 2025-04-07T12:00:00+01:00
description: "Extract and monitor bugbounty scopes"
---

As a bug bounty hunter, one of the most critical aspects of your workflow is keeping track of program scopes. Whether you're focused on a handful of programs or casting a wider net, knowing when new assets are added to scope can give you a significant advantage.

However, there's a consistent challenge across all bug bounty platforms: **scope formats are wildly inconsistent**. Each platform has its own way of representing targets, and even within the same platform, different programs might express their scopes in various ways.

Let's look at a particularly frustrating example: domains with multiple TLDs. A program might express them like this:

```
domain.(com|fr|xyz)
```

When what you really need for effective scanning and testing is:

```
domain.com
domain.fr
domain.xyz
```

This normalization process becomes even more complicated when you're monitoring multiple platforms simultaneously.

## Introducing ScopesExtractor

To address these challenges, I created [ScopesExtractor](https://github.com/JoshuaMart/ScopesExtractor), a tool designed to monitor bug bounty program scopes across multiple platforms, track changes, and normalize the formats for consistency.

The first version of this tool dates back to 2023 but I have just released a version with many changes this week, a bit like version 2.0 with the main change being the ability to run the tool in API mode, as well as change detection with Discord notifications.

## The Platform Normalization Nightmare

While developing ScopesExtractor, I quickly discovered that each platform presents its own unique challenges when it comes to scope normalization. Let me share my experience with some of the major platforms:

**Immunefi: The Gold Standard**

Surprisingly, **Immunefi** proved to be the most straightforward platform to work with. Their scopes are well-formatted and consistent, requiring 0 normalization effort. This made implementing the Immunefi connector relatively painless.

**Intigriti and YesWeHack: Manageable but Quirky**

**Intigriti** and **YesWeHack** have some inconsistencies in their scope formats, but they're generally manageable. For example, YesWeHack often uses the multi-TLD format mentioned earlier:

```ruby
# From YesWeHack normalizer
MULTI_TLDS = %r{(?<prefix>https?://|wss?://|\*\.)?(?<middle>[\w.-]+\.)\((?<tlds>[a-z.|]+)}.freeze

def self.normalize_with_tlds(match)
  match[:tlds].split('|').map { |tld| "#{match[:prefix]}#{match[:middle]}#{tld}" }
end
```

This code shows how ScopesExtractor parses and expands these multi-TLD patterns into individual domain entries.

**Hackerone: Hidden Scopes**

**Hackerone** presents a different challenge. While their structured scope format is decent, many programs include additional scope information directly in their descriptions rather than in the dedicated scope section. This makes automated extraction significantly more complex, as you need to parse natural language text to identify potential scope items.

As this is the platform I use the least, it's something I haven't yet integrated, but perhaps in a future version.

**Bugcrowd: The Ultimate Challenge**

By far, **Bugcrowd** is the most problematic platform when it comes to scope normalization. The issues are so extensive that in my configuration file, out of 239 total exclusions, 220 are dedicated solely to Bugcrowd!

Bugcrowd's scope format varies wildly between programs, and they have a complex hierarchy of target groups and targets. The extraction process requires multiple API calls and extensive parsing:

```ruby
def self.extract_targets(brief_url)
  url = File.join(BASE_URL, brief_url)

  if brief_url.start_with?('/engagements/')
    targets_from_engagements(url)
  else
    targets_from_groups(url)
  end
end
```

And the list of edge cases seems endless. Some programs use special markers, others have unique formatting, and many require specific handling.

## The Importance of Scope Normalization

Why go through all this trouble? Because normalized scopes are essential for:

1. **Accurate Asset Tracking**: Know exactly what's in scope at any given time
2. **Automated Scanning**: Feed clean, consistent data to your scanning tools
3. **Change Detection**: Quickly identify when new assets are added to scope
4. **Efficient Testing**: Focus your efforts where they matter most

Imagine you're running automated reconnaissance on a program that uses the `domain.(tld1|tld2|tld3)` format.
Without normalization, your tools would either fail to parse the domain or treat it as a literal string. But with proper normalization, you can expand this into three separate domains for accurate scanning.

## Implementation Details

ScopesExtractor uses a modular architecture with specific normalizers for each platform:

```
libs/utilities/normalizer/
├── bugcrowd.rb
├── intigriti.rb
├── normalizer.rb
└── yeswehack.rb
```

The core normalization logic handles common patterns:

```ruby
def self.global_normalization(value)
  value = global_end_strip(value)

  # Remove protocol (http:// or https://) if string matches the pattern
  value = value.sub(%r{https?://}, '') if value.match?(%r{https?://\*\.})

  # Replace certain patterns and remove unwanted trailing characters
  value = value.sub('.*', '.com')
               .sub('.<TLD>', '.com')

  # Add "*" at the beginning if the string starts with a dot
  value = "*#{value}" if value.start_with?('.')

  # Return the lowercase string
  value.downcase
end
```

Platform-specific normalizers then handle the unique patterns of each bug bounty platform.

## Setting Up Your Own Scope Monitoring

Getting started with ScopesExtractor is straightforward:

1. Clone the repository:
   ```bash
   git clone https://github.com/JoshuaMart/ScopesExtractor
   cd ScopesExtractor
   ```

2. Create and configure your `.env` file:
   ```bash
   cp .env.example .env
   # Edit with your platform credentials and Discord webhook URLs
   ```

3. Build the Docker image:
   ```bash
   docker build . -t scopes
   ```

4. Run in your preferred mode:
   ```bash
   # Classic mode
   docker run --mount type=bind,source="$(pwd)/libs/db/db.json",target=/app/libs/db/db.json scopes

   # API mode
   docker run -p 4567:4567 --mount type=bind,source="$(pwd)/libs/db/db.json",target=/app/libs/db/db.json scopes
   ```

## Conclusion

Bug bounty scope monitoring is a critical aspect of maintaining an effective hunting workflow. The inconsistent formats across platforms make this a challenging task, but with proper normalization and automated tracking, you can stay ahead of the curve and be among the first to discover vulnerabilities in newly added assets.

By normalizing scopes, you're not just organizing data, you're giving yourself a competitive edge in the bug bounty ecosystem.

*Happy hunting!*
