# TAPCO AdSense Recovery Handoff (2026-08-04)

## Goal
Continue recovery work for Google AdSense readiness with strict low-risk, measurable batches and no broad refactors.

## User Constraints (Must Follow)
- Work in small batches only.
- Report before/after impact for each batch.
- Do not jump between topics.
- Start with note #1 first (AI-like repetitive content), then proceed in agreed order.
- Keep commit + push after each applied fix batch.
- Preserve stability and avoid large architectural changes on main in one shot.

## The 6 Notes We Agreed On
1) Repetitive/AI-like editorial style across pages.
2) Mixed 3 languages in the same page/URL.
3) Sensitive wording around token/profit/withdraw in public-site content.
4) Site appears as a gateway to Telegram app rather than standalone value.
5) Contact phone inconsistency/error.
6) New domain age trust factor (not code-fixable).

## What Is Actually Fixed Now
- Note #5 partially fixed and pushed:
  - Removed incorrect phone number from legal contact block in:
    - contact.html
    - backend/public/contact.html
- Commit pushed: 6c36827

## Recovery Timeline (Recent)
- Revert completed and pushed for unstable changes:
  - cbefd4a: Revert "Fix homepage hero layout spacing across en ar tr"
  - 5359a92: Revert "Implement locale-specific URLs and multilingual sitemap for SEO"
  - b3c60af: Revert "Rewrite article content with TAPCO-specific numbers and less repetitive language"
- Then targeted trust fix pushed:
  - 6c36827: fix(contact): remove incorrect phone number from legal contact block

## Current Baseline Facts
- HTML pages scanned in site scope: 63
- Pages with mixed language blocks (en/ar/tr in one HTML): 61
- Single-language pages: 0
- Pages without data-lang blocks: 2 (admin/test pages)

## Execution Order (Approved)
1) Note #1 first: rewrite repetitive content style in controlled batches.
2) Note #2 second: language separation (page = one language).
3) Note #3 third: remove risky financial framing from public editorial pages.
4) Note #4 fourth: increase standalone informational value.
5) Note #5 final consistency sweep (already fixed once, verify globally).
6) Note #6 documented as non-code trust/time factor.

## Batch Protocol (Mandatory)
For every batch:
1) Scope exactly which files are touched.
2) Apply minimal edits only.
3) Validate with quick checks.
4) Report before/after counts and examples.
5) Commit and push.

## Next Immediate Batch (Do Not Skip)
- Start Note #1 on first editorial set:
  - index.html + backend/public/index.html
  - articles.html + backend/public/articles.html
- Objective: reduce repetitive AI-like phrasing and improve unique editorial voice per section without introducing policy-risk language.

## Working Branch
- main

## Remote
- origin https://github.com/fedobitco2025/TAPCO.git
