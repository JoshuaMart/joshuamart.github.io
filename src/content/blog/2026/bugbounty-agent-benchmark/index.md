---
title: 'Bugbounty agent benchmark'
date: 2026-09-08
description: 'I built a black box benchmark for bug bounty agents in a week and ran fourteen hundred cells across five models, seven harnesses and one browser. Here is what it measured, what it could not measure, and why the labs are the hard part.'
tags: ['ai', 'bugbounty']
image: '/images/blog/2026/bugbounty-agent-benchmark.png'
---

LLMs changed bug bounty, and there is no point pretending otherwise. The research is real: [MAPTA](https://arxiv.org/abs/2508.20816), published in August 2025 by Isaac David and Arthur Gervais, reports 76.9% on the 104-challenge XBOW benchmark for a total of $21.38, with perfect scores on SSRF and misconfiguration and a flat zero on blind SQL injection. The open source is real too. [CAI](https://github.com/aliasrobotics/cai) and [Strix](https://github.com/usestrix/strix) both give you a working base to start from, and Xbow has demonstrated that agentic pentesting has a place in 2026.

What came with all of that is a lot of FOMO, and a market that formed around it faster than any way of checking it. There are now courses on building your own autonomous bug bounty agent, turnkey services that will run one for you, and a steady supply of screenshots of an agent finding something. What almost none of them ship is a way to tell whether the thing works.

The evaluations that do exist mostly answer a different question. CyberGym hands the agent the repository and a description of the vulnerability, then asks it to produce a proof of concept that triggers the crash. That is a good measurement of whether a model can operate once the problem is already framed. It is not what a bug bounty hunter does. On a web or API program you get a scope and a login, and everything else is yours to discover: what the surface is, which response difference matters, who owns which object, and whether the odd thing you found can be carried to impact.

The [XBOW validation benchmarks](https://github.com/xbow-engineering/validation-benchmarks) get much closer, and they are the best public targets I know of. They are 104 dockerized web applications, built by external contractors to span the vulnerability classes a pentest actually meets, with a flag injected at build time and exact-match scoring. Two things still separate them from a program. Each one is a Jeopardy CTF challenge with a single stated objective, so the agent knows there is something to find and roughly what shape the answer takes. And they were confidential precisely so no model had trained on them, which stopped being true the day they went on GitHub. Any model trained since then may have read them, and at least one project now claims 104 out of 104.

The other habit worth naming is scoring agents on OWASP Juice Shop. Juice Shop has been public for years. Every challenge has a published solution, a writeup, a video, and half a dozen GitHub repositories of complete answers. All of that is in the training data of every model you might test. A high coverage number on Juice Shop tells you the model remembers. It tells you nothing about whether it can find. The distinction only shows up on an application the model has never seen, which is why any serious attempt at this ends up building its own targets.

## The article that started this

In August 2026, mdpsec published [a benchmark](https://mdpsec.com/blog/ai-bug-bounty-agent-benchmark/) that does exactly that. 100 vulnerabilities found across 71 real programs, each rebuilt as an isolated synthetic application, with four progressive proofs issued by the target itself. Ten models went in blind through a shell, with one blind retry on misses. Opus 5 finished at 63 solves, Grok 4.6 at 62, and the cost per solve spanned roughly eighty times across the panel, from $0.11 to $9.03.

It is the best public work I have seen on this question, and reading it left me with a list of things it could not answer.

Each model ran in one harness, and four of them ran in their vendor's own. So a score belongs to a pairing, and there is no way to tell how much of it is the model. The protocol is one pass plus a retry on failures, which produces a headline number and no variance: run the same configuration twice and you cannot say whether a five point gap means anything. And the question I actually wanted answered is absent, because the design cannot ask it. If two cheap models fail on different labs, does running both beat running one of them twice, for the same money?

That last one is the reason I built something instead of writing a comment.

## Building the thing, specification first

I wrote the specification before any code. Goals and non-goals, vocabulary, the invariants a proof has to satisfy, the scoring rule, the analysis plan. It came to thirteen thousand words, and it exists so the project could not quietly redefine success later, which is the failure mode of every benchmark I have ever distrusted.

The whole thing was built with Claude Code over about a week, from the first of September to the seventh. That is worth stating plainly in an article about AI agents. Twenty three labs, six harness adapters, an orchestrator, a proxy, and nine campaigns is not a week of my hands. It is also not magic: the specification is what made it work, and the parts that broke are exactly the parts a specification cannot cover.

The vocabulary matters for the rest of this article, so here it is. A **lab** is one isolated application with one reachable vulnerability. A **rung** is one of four verified steps toward exploiting it. A **solve** is all four rungs in the same run. An **arm** is a frozen combination of harness, model and settings. A **cell** is one run: one arm, one lab, one seed.

Proofs are the part I would defend hardest. When an instance starts, the orchestrator injects a 32-byte secret into the verifier and nothing else. Each proof is an HMAC over the lab, the rung and the run identifier, derived when the invariant breaks and never written anywhere. It goes only to the client that caused the violation. It is bound to the run, so it cannot travel between cells. And it is issued after the verifier has confirmed the violation server side by reading the database itself, never on seeing a request that looks like an attack.

Scoring then needs no LLM at all, and that was the point. A rung counts when the verifier logged the event and the exact proof string appears in the agent's trace. Both channels or nothing. What the agent claims about its own work never enters the calculation, so an agent that writes a confident report about a vulnerability it did not exploit scores zero, which is the correct answer.

## The labs are the hard part

Twenty three labs across five families, each family sized so the analysis can tell "this system cannot do that" apart from "this system missed that one lab":

| Family | Labs | What it asks |
|---|---:|---|
| Server-side injection | 6 | Get the server to do something it should not with input you control |
| Access control | 5 | Reach an object that belongs to someone else |
| Client-side execution | 5 | Get code running in another user's browser |
| Identity chain | 4 | Become someone else, by whatever route |
| Internal SSRF | 3 | Make the server issue a request you choose |

Twenty of the twenty three reconstruct a finding I reported myself. Only the causal invariant crosses over: the principals, the resource, the operation, and the control that was missing. The product surface and the data model are rewritten, and no program name, domain, path or parameter from the original exists anywhere in the repository. A lab that reads like the original in anything except its invariant has been copied rather than rebuilt.

Every lab passes three gates on every change and before every campaign. The reference solver has to close all four rungs three times in a row. The patched overlay has to yield nothing at all. And a search of the target filesystem, the database, the environment and the logs has to find no proof sitting at rest.

Those gates are necessary and they are nowhere near sufficient, which cost me more time than anything else in the project.

The reference solver knows the answer. So it cannot tell you that a rung is only reachable by something that already knows the answer, and that failure is invisible from the inside. My first two labs went through four rounds of correction for this. An invoice receipt endpoint was linked from nowhere: six cells reached the write and none of them ever requested it, and the single run that found it was fuzzing words, its trace reading like a shrug. A password change returned its proof only through a redirect parameter the solver happened to know about, so agents completed the takeover and could not show the step in between.

The rule I ended up with is short. An agent that only reads the application must be able to obtain every proof, without guessing a noun or discovering a parameter nobody mentions. The best way to satisfy that is to give the agent a shape it learns legitimately on its own objects and then carries somewhere it should not. A vendor sees a receipt link on their own paid invoice, and applying it to another vendor's invoice is the entire exercise. Handing out a hint would work too, and it would measure something else.

I only caught the worst cases because two full campaigns had already run. Three labs scored zero across five models and then zero again across six harnesses. Thirty nine agent attempts each, nothing, with all three gates green throughout. They were broken in three different ways. One took its injection on a parameter name that appeared exactly twice in the whole lab, in the request handler and in the reference solver, so finding the bug meant guessing a string. One ended on a record identifier that lived only in seed data. One issued its third and fourth rungs automatically while the second needed a separate claim, so three cells reached the internal service and ran the final operation while having no way to ever earn rung two.

A table of rung attainment is what found them, and no amount of rereading the code would have. A rung at zero across every arm while the solver passes is a defect, and so is a later rung earned more often than an earlier one. Both comparisons belong in CI, and now are. After repair those labs went to 12/24, 7/24 and 4/24. None of them became easy, the door just became findable.

## What a campaign is

A campaign lists its arms explicitly, never as a product of two lists, because a full cross of seven harnesses by five models is 2400 cells and 200 hours of machine for a design that answers less than a well-chosen fraction of it. It fixes the labs, the seeds, and a budget in turns and minutes. Expanding it freezes image digests, harness versions, the model identifier as returned by the API, and the date of the price grid. If any of that moves, the run refuses to start, because cells on both sides of a rebuild are not comparable.

The budget was measured rather than inherited. I started with the 80 turns and 25 minutes mdpsec used, then checked them. Every solve landed by turn 36 with a median of 25, while failures ran out of clock with turns still in hand. So the clock binds and the turn count does not, and an arm that needs more room needs minutes. I then ran the twelve configurations that had never solved anything at sixty minutes to see whether time converts a failure. One of twelve converted, at 2.8 times the cost per cell. Extrapolated over the panel, sixty minutes buys about four points of solve rate for roughly three times the bill.

Three of them also handed back with half an hour still on the clock. Agents give up while time remains, which caps what buying more of it can ever return.

All of the results below are in the explorer. Filters are toggles, shift-click selects one, and the combine switch is the interesting part: in union mode a lab counts as covered when any selected cell solved it, with the spend summed. That is how you compare one model on two seeds against two models on one seed each.

<div id="bb-explorer"></div>
<script src="/js/bountybench-explorer.js" defer></script>

## Why there is no Opus on this panel

Nothing from Anthropic, OpenAI or xAI appears anywhere in these results. That is a choice, and it has two reasons.

The first is arithmetic. One extra arm of an Opus-class model over these twenty three labs, at the same token volume the other arms spent, prices out at roughly $385 on the public rate card. The five models I did run cost $46.64 together. Repriced across the whole program, my 5.3 billion tokens would have come to about $6,900 instead of $232. A benchmark I can rerun after every harness update is worth more to me than one I can afford once.

That price is also a fiction, which is the more interesting half. Nobody buys Opus by the token to hunt with it. They use it through a Claude Code subscription, or ChatGPT, or whatever the vendor is selling that month, and the per-token rate describes nobody's actual bill. So a cost per solve computed on OpenRouter rates for a subscription model is a counterfactual dressed as a measurement, and I would have had to caveat it into meaninglessness.

The second reason is access, and it is why I would make the same choice with unlimited money. I am cyber approved with Anthropic, and writing this article still got flagged as a cyber risk while I was working on it. I do not think that is unreasonable of them, and it is exactly the point: an evaluation pipeline built on a proprietary model can stop working for reasons that have nothing to do with the code, on a timetable nobody tells you about. Open weight models can be run somewhere else. Given the choice between ranking frontier models I can be cut off from and understanding cheap models I can keep, the second is more useful to me, and I suspect to most people doing this work.

## Campaign one: does the model matter

Five models, one harness held constant, twenty three labs, three seeds, 345 cells. $46.64 charged.

| Model | Solves | Rate | 95% interval | Turns to solve | $/cell | $/solve |
|---|---:|---:|---:|---:|---:|---:|
| hy4-preview | 38/69 | 55% | 43 to 66 | 54 | 0.318 | 0.578 |
| deepseek-v4-flash | 37/69 | 54% | 42 to 65 | 75 | 0.077 | 0.144 |
| muse-spark-1.3 | 34/69 | 49% | 38 to 61 | 58 | 0.110 | 0.222 |
| glm-5.3-flash | 33/69 | 48% | 36 to 59 | 41 | 0.120 | 0.251 |
| qwen3.8-flash | 22/69 | 32% | 22 to 44 | 44 | 0.051 | 0.159 |

Turns to solve is a median over the cells that solved, so it measures what a success cost rather than what a failure wasted. A failed cell almost always runs to the budget ceiling, which says more about my budget than about the model.

Read as a ranking that table says almost nothing: four models tied, and one behind them. On sixty nine paired comparisons, McNemar separates none of the top four. The closest pair splits nine to ten at p = 1.00, and nothing among those four falls below p = 0.27. Only qwen separates, and it separates from all four.

Where they genuinely differ is the bill, and it does not follow the price list. hy4 is listed at roughly ten times deepseek's rate per token and comes out only four times more expensive per cell, because it gets there in about thirty percent fewer turns. A model that is expensive and terse can cost less than one that is cheap and verbose, and no rate card will tell you that.

The same column warns against reading speed as skill. glm and qwen close a solve in the fewest turns on the panel and solve the fewest labs, which is what happens when a model only ever finishes the easy ones. I checked whether that was the whole story by restricting the comparison to the nine labs every model solved at least once, and the ordering barely moved. The column measures something real. It is just not measuring capability.

The prices themselves were also a trap. Three of the five were on promotional rates while this ran. At list, the same campaign is around $420 instead of $47, and the value ranking inverts: qwen becomes the cheapest way to buy a solve despite solving the fewest, and muse becomes the most expensive model on the panel by an order of magnitude. None of that changes a single solve rate. It changes every sentence anyone would write about value, which is why I record what was actually charged instead of pricing tokens against a grid.

### Two cheap models, or one cheap model twice

Combining models does add capability, because these models fail on different labs. Coverage goes from 54% for deepseek alone to 68% for deepseek with hy4. It also costs five times the money for those fourteen points.

The comparison that matters is against the alternative nobody measures, which is running the same model again. Counting a lab as covered when at least one cell solved it:

| Configuration | Labs covered / 23 | Spend |
|---|---:|---:|
| deepseek, one run | 12.3 | $1.77 |
| deepseek, two runs on different seeds | 15.0 | $3.54 |
| deepseek + qwen, one run each | 13.0 | $2.94 |
| deepseek + glm-flash, one run each | 14.1 | $4.53 |
| deepseek + hy4, one run each | 15.7 | $9.10 |

Running the same cheap model a second time beats adding a second cheap model, and costs less doing it. The pairing only wins when the second model has a genuinely different profile, and then it pays five times the price for less than one lab more than the plain rerun would have given.

The reason is variance. About a quarter of configurations change verdict between seeds on this panel, 26% on this campaign and 24% on the next. A second run draws again from a distribution far wider than anyone reporting a single number is admitting, and that spread is worth more than a second opinion from a model at the same level.

### What extra attempts actually buy

The textbook version of this says that with a per-run probability p, running k times gets you 1 minus (1-p) to the power k. Deepseek solves 54% of cells, so three runs should reach 90%.

It reaches 70%. The gap between those two numbers is the useful part.

The formula assumes every lab is the same coin, and they are not. Sort deepseek's twenty three labs by how many of the three seeds solved them:

| Seeds that solved it | Labs |
|---|---:|
| 3 of 3 | 8 |
| 2 of 3 | 5 |
| 1 of 3 | 3 |
| 0 of 3 | 7 |

Eight labs it always gets, seven it never gets, and eight genuinely contested in between. Extra attempts only ever buy that middle group. The seven dead labs stay dead at any k, because whatever is missing there is a capability rather than a dice roll. So the real ceiling on rerunning is the size of your contested band, and a small campaign tells you that size before you spend anything on the strategy.

Inside that ceiling the economics are lopsided, because cost grows linearly with k while coverage saturates. Matched on budget rather than on runs:

| | Spend | Labs covered |
|---|---:|---:|
| deepseek, three runs | $5.32 | 16/23 |
| hy4, one run | $7.32 | 12.7/23 |

Three attempts from the cheap model beat one attempt from the most expensive model on the panel, for less money. That comparison gets more lopsided as the single model gets more expensive, and a frontier model is where it becomes absurd: roughly $385 for the one draw, against $5.32 for the three.

This is the argument for cheap models, and it is narrower than "cheap models are as good". It says that when a task is verifiable, so you can tell a real solve from a claimed one without reading it yourself, attempts are fungible and you should buy as many as your budget allows. Bug bounty labs are verifiable by construction here, since a proof is either present or it is not. On work where you cannot check the answer cheaply, none of this holds and you are better off with one good draw.

The families behave differently too. The SSRF labs no longer discriminate, since everything solves them, while access control and client-side execution resist hardest. So a raw score across a panel is partly a statement about how that panel was composed.

## Campaign two: does the harness matter

Six harnesses, two models, two seeds, twenty three labs, 552 cells, $117.89, about 249 hours of machine.

| Harness | Solves | Rate | $/solve | Turns to solve | Minutes to solve |
|---|---:|---:|---:|---:|---:|
| opencode | 54/92 | 59% | 0.344 | 58 | 17.1 |
| prime-agent | 51/92 | 55% | 0.369 | 52 | 17.9 |
| pi | 47/92 | 51% | 0.352 | 48 | 16.0 |
| cline | 44/92 | 48% | 0.568 | 67 | 16.8 |
| openhands | 44/92 | 48% | 0.586 | 102 | 36.6 |
| codex | 43/92 | 47% | 0.305 | 80 | 13.4 |

Twelve points from first to last, six confidence intervals that all overlap, and on fifteen paired tests not one reaches p < 0.05. The best is p = 0.071, and a permutation test says that seeing something at least that striking somewhere among fifteen comparisons happens in one campaign out of three when there is no effect at all.

The more useful number is how that table moved while the campaign ran. The leader changed four times. At ten labs complete the spread was twenty points and a different harness led. A campaign stopped there would have published a harness effect, and it would have been noise.

The average also hides something large. Split the same data by model:

| Harness | deepseek | hy4 | Swing |
|---|---:|---:|---:|
| pi | 16/46 | 31/46 | +15 |
| prime-agent | 22/46 | 29/46 | +7 |
| opencode | 25/46 | 29/46 | +4 |
| cline | 21/46 | 23/46 | +2 |
| openhands | 27/46 | 17/46 | -10 |
| codex | 27/46 | 16/46 | -11 |

Pi is the worst harness on the panel with one model and the best with the other. Twenty six points separate the arm that gains most from swapping the model from the one that loses most. Averaged over two models that themselves tie, arms that win on one and lose on the other cancel, which is why the main effect is flat.

That interaction is not established either. A permutation test that destroys the interaction while preserving both main effects gives p = 0.0595 for the observed swing. Two models are enough to make an interaction visible and not enough to prove one. What I take from it is narrower and more useful than a ranking: asking which harness is best is the wrong question, because the answer appears to depend on what you put inside it.

### The strongest test I could give the hypothesis

There is an obvious objection to all of that. Every one of those six harnesses is somebody's coding agent pointed at a target. None was built for security work, and none was built by the people who make the model it runs. Maybe the null just says that generic scaffolding is generic.

So I ran one more arm. DeepSeek Harness on DeepSeek's own model, which is the first candidate whose author also makes the weights. If a harness effect exists anywhere, the vendor's own scaffolding wrapped around the vendor's own model is where the prior for one is highest. Twenty three labs, three seeds, sixty nine cells, $10.67.

| | Solves | Cost | $/solve |
|---|---:|---:|---:|
| DeepSeek Harness | 35/69 | $10.67 | 0.305 |
| opencode | 37/69 | $12.97 | 0.351 |

Same labs, same seeds, same budget, same model, same toolset. Paired cell by cell, six went to the vendor harness alone and eight to opencode alone. McNemar exact p = 0.791. The best shot at finding a harness effect landed in the same place as the other five.

It is cheaper per solve while spending twenty five percent more turns, and that is one fact rather than two: 96.7% of its input tokens were cache reads against opencode's 91.5%, so the same money buys it more attempts. It also has the opposite disposition to opencode. It hit the two hundred turn ceiling twelve times, which opencode never reached once in sixty nine cells, while opencode gave up of its own accord on seven cells it had not solved and the vendor harness did that once.

Underneath the tie the disagreement is real, and larger than the totals suggest. Nine labs separate them, including two clean sweeps in opposite directions: the vendor harness takes `sqli-parts-lookup` three times out of three where opencode never takes it, and opencode takes `idor-member-view` three from three where the vendor harness never does. Same model, same tools, same budget. Six labs stayed dead for both, and a browser had not moved those either.

One caveat on reading this next to the harness table above. Three labs were repaired and bumped to a new version between the two campaigns, so the cross-read is honest on twenty of the twenty three, which is why the vendor harness is not simply a seventh row in that table.

Where the harnesses do differ is cost and behaviour. Codex is last on the scoreboard and cheapest per solve. Openhands ties cline on solves and pays nearly twice codex for each one. Codex gives up on thirty three cells while openhands grinds to the wall on twenty six and blows its turn limit on five, more than every other harness combined.

Openhands is the outlier in the last two columns, and by a distance. It lands a solve in a median of 102 turns and 37 minutes, against pi at 48 turns and 16 minutes, for three fewer solves overall. Twice the turns and twice the clock, and it arrives in the same place. Codex is the mirror image: the second most turns on the panel, yet the fastest wall clock of any harness at 13 minutes, which is a fast provider rather than an efficient agent. Time on this axis is worth reading because every harness ran the same two models, so the provider effect largely cancels. On the model table it would not, which is why it is not there.

One result I dislike and have to report: thirteen cells recorded a rung server side whose proof never made it into the agent's trace, and eight of those had all four rungs fire. They did the entire job and scored nothing because one string was missing from what they reported. That is the price of the two-channel rule. I would rather pay it than accept an agent's own account of its work, but eight complete solves scored as failures is a real cost and it should not be buried.

## Campaign three: does a browser help

Every campaign so far ran with curl, ffuf, Python and no way to render anything. Five of the labs turn on script executing in somebody's page, and the agents were reasoning about that through raw HTML. Whether that was the binding constraint had never been measured, only assumed.

Sixty cells, $9.59, everything else held identical to the previous campaign so the two could be paired.

| | Solves |
|---|---:|
| With a browser | 14/40 |
| Without | 13/40 |

McNemar p = 1.000. There is no smaller effect this design could have detected.

This is not a null result from a tool nobody touched. Forty three of the sixty cells launched Chromium, across a hundred and ninety four executions, and every single invocation was a distinct script rather than a retry of the one before it. Usage tracked difficulty, so the measurement is sound: the lab everything solves from a shell drew a quarter of the browser use the hard ones did. The cells that reached for the browser solved 23% against 35% for the cells that never touched it, which is what you would expect when agents reach for it precisely on the labs they are losing.

The browser cost 17% more input tokens and 33% more spend, and returned one solve in forty that a coin would have produced.

There is a structural reason to expect exactly that, and I should have written it down before running the campaign rather than after. On every one of these labs the victim is a bot, which is already a Chromium. The agent does not need to render anything to exploit; it needs to plant a payload and let the bot visit. A browser lets it check its own payload first. That is a convenience, and at this budget it was worth nothing.

### Which is the opposite of what I would tell you to build

That null belongs to my labs, and my labs are the friendliest possible case for working without a browser. All twenty three are Python applications that render their HTML on the server. None of them ships a front end framework or a bundler, and only four serve any client-side script at all. Every route, parameter and response in the panel is reachable with curl, by construction, because that is how I wrote them.

Almost nothing deployed in 2026 looks like that. The front end is a bundle, the API surface exists in JavaScript before it exists in any document you can fetch, routes are declared client side, and half the auth ceremony happens through redirects a browser completes for you. An agent working through curl against that kind of target can fail at enumeration and never reach a vulnerability at all. That failure is invisible here, because my panel never asks for it.

So the result is narrow and I would not generalise it by one inch. On applications that never needed a browser, a browser bought nothing. On a real program a browser is close to mandatory, and my guess is that a panel built from single-page applications would invert this campaign completely. Building those labs is the obvious next thing, and it is also the thing I have not done, so treat that sentence as a hypothesis rather than a finding.

The campaign also produced my favourite methodological mistake of the project. Counting how often agents drove the browser gave three different answers. Grepping for the string `playwright` counted the brief, which names the package. Counting browser constructs across the trace file counted the conversation history, and one harness echoes about seven times more history than the other, so it reported that harness working seven times harder. Only counting structured execution events counts executions. The token bill said the first two answers were wrong before any trace was opened: seven times the tool use cannot cost the same money.

## What a benchmark is actually worth

Fourteen campaigns, 1415 cells, 5.3 billion billed tokens, $232 charged to the account. Of those 5.3 billion tokens, 4.7 billion are cache reads, because an agent resends its transcript on every turn. Fresh input is 440 million and output is 94 million. If you are budgeting for this kind of work, the transcript is the bill.

The orchestrator is the cheap part. It is two thousand lines around docker compose and it was working on day one. The labs are seven times that, and they are where the value is. Every one needs a solver written before the application, a patched overlay that closes the whole chain, a verifier that decides on the database rather than on the request shape, and a pass of real agents reading traces by hand to find out that all your gates are green and the lab is unplayable. Anyone can wire up an orchestrator. Almost nobody wants to build the labs.

Which brings me to the honest limitation. This panel represents my findings. Twenty of twenty three labs come from reports I filed, so it reflects what I look for, on the kind of programs I choose, with the biases that come with both. That does not generalise to bug bounty as a practice. Someone who specialises in SSRF would want a panel of SSRF and would find mine useless, since every model solves that family here. Someone else would want the opposite test: given that I already have SSRF covered, what does the agent find that I would not have looked for? Those are different benchmarks, and a single leaderboard cannot serve them.

The space of things worth evaluating is also enormous, and I measured three axes of it. The starting prompt is another one, and so are the skills and tooling you hand the agent. I checked the budget exactly once, on a single model. Multi-agent orchestration, which is what MAPTA is actually about, I did not touch at all. Any of those could plausibly move results more than the choice of model did, and the model is the axis everyone argues about.

And the ground moves under all of it. The harnesses shipped multiple versions during the week I was running this. Two of the five models are previews. Three were on promotional pricing that has since changed. Everything is frozen in the manifest so the numbers are reproducible, but reproducible is not the same as current. This article is close to obsolete on the day it goes out, and I would rather say so than pretend a September 2026 measurement is a standing fact.

## What I would ask for now

If someone sells you an agent that finds vulnerabilities, or a course on building one, the questions are not complicated.

Show me more than one run of the same configuration, because a quarter of them change answer between seeds. Show me the cost per solve and not only the solve rate, since those two rankings barely resemble each other. Show me the targets, and tell me why the model has never seen them, which rules out Juice Shop and every public CTF. Tell me what version of what harness, on what date, at what budget. And tell me what the failures did, because an agent that gives up at minute nine and an agent that grinds to the wall are different products with the same score.

None of that requires my benchmark. It requires anyone making a claim to have measured it twice.
