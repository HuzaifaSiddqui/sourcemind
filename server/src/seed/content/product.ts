import type { Page } from './legal.js';

/** Rendered to a real .docx at seed time. [heading?, text] */
export const apiArchitecture: [boolean, string][] = [
  [true, 'API Architecture Overview'],
  [false, 'This document describes the architecture of the Helix public API, how clients authenticate, and the operational guarantees we give to integrators. It is maintained by the Platform team and reviewed every quarter.'],
  [true, '1. Service Topology'],
  [false, 'Requests enter through a global edge layer that terminates TLS and routes traffic to regional API gateways in UK South and EU West. The gateway validates credentials, applies rate limits, and forwards requests to stateless Node.js services running on Kubernetes.'],
  [false, 'Read-heavy endpoints are served from a Redis cache with a default time-to-live of 60 seconds. Writes go to PostgreSQL, and domain events are published to a Kafka topic consumed by the analytics and notification services.'],
  [true, '2. Authentication'],
  [false, 'Server-to-server integrations use the OAuth 2.0 client credentials flow. Access tokens are JSON Web Tokens signed with RS256 and expire after 60 minutes. Personal API keys are available for scripts and are scoped to a single workspace.'],
  [false, 'All keys can be rotated without downtime: a new key and the previous key are both valid for a 24-hour overlap window.'],
  [true, '3. Rate Limits'],
  [false, 'Each API key may make up to 600 requests per minute, with a burst allowance of 100 requests. Bulk export endpoints are limited to 10 requests per minute. Clients that exceed a limit receive HTTP 429 with a Retry-After header.'],
  [false, 'Enterprise customers can request higher limits through their account manager; increases are applied per workspace.'],
  [true, '4. Versioning and Deprecation'],
  [false, 'The API is versioned in the URL path, for example /v3/. Breaking changes are only introduced in a new major version. When a version is deprecated, it remains available for at least twelve (12) months and deprecation notices are sent to workspace admins by email and in response headers.'],
  [true, '5. Deployment'],
  [false, 'Services are deployed with a blue-green strategy. Each release is first shifted to 5% of traffic for 30 minutes while error rates and latency are monitored; automated rollback triggers if the error rate exceeds 1%. Production deploys happen Monday to Thursday only.'],
  [true, '6. Observability'],
  [false, 'All services emit structured logs, traces and metrics via OpenTelemetry. Our internal latency objective is a p95 under 300 ms for read endpoints and under 800 ms for write endpoints.'],
];

export const smartSearchPrd = `# Product Requirements — Smart Search v3

## Summary

Smart Search v3 replaces keyword-only search in the Helix analytics platform with hybrid retrieval that understands intent. Customers struggle to find saved reports and dashboards when they do not remember exact titles, which drives support tickets and slows adoption.

## Problem

In Q2 research, 41% of admins said they could not find existing dashboards and rebuilt them instead. Search accounts for 18% of all support tickets. Keyword search fails on synonyms such as "churn" versus "cancellations" and on spelling variants.

## Goals

- Reduce search-related support tickets by 30% within two quarters of launch.
- Increase search success rate (a result is opened within 60 seconds) from 54% to 75%.
- Keep p95 search latency under 400 ms.

## Users

Primary users are analysts who search for dashboards several times a day. Secondary users are workspace admins who audit and clean up content.

## Requirements

- Hybrid retrieval combining semantic vectors and keyword matching.
- Results must respect workspace permissions; users never see items they cannot open.
- Filters for owner, content type, folder and last updated date.
- Typo tolerance and synonym support for common analytics terms.
- Query analytics for admins showing top searches with no results.

## Out of Scope

Natural-language question answering over dashboard data is out of scope for v3 and will be explored separately.

## Launch Plan

Beta to 20 design-partner workspaces in November, general availability in January. Success metrics are reviewed weekly by the Search squad.
`;

export const releaseNotes = `RELEASE NOTES — HELIX 4.2

Released 6 October 2026.

HIGHLIGHTS

Scheduled exports now support Parquet and can be delivered directly to Amazon S3 and Google Cloud Storage buckets.

Dashboard loading is up to 35% faster for workspaces with more than 500 dashboards, thanks to incremental query caching.

IMPROVEMENTS

Admins can now enforce single sign-on for all members and disable password login entirely. Audit logs include the IP address and user agent for every sign-in.

The API now returns a request identifier in every response header to make support investigations faster.

FIXES

Fixed an issue where timezone changes did not apply to scheduled reports until the next day.

Fixed chart labels overlapping on narrow screens.

DEPRECATIONS

API v1 will be retired on 31 March 2027. Integrations should migrate to v3 before that date.
`;

export const marketResearch: Page[] = [
  [
    ['h', 'Q3 2026 Market Research — Mid-Market Analytics'],
    ['p', 'This report summarises desk research and 32 customer interviews conducted between July and September 2026 to understand demand for self-service analytics among UK and EU mid-market companies with 200 to 2,000 employees.'],
    ['h', 'Market Size'],
    ['p', 'We estimate the serviceable market for mid-market self-service analytics in the UK and EU at £1.9 billion in 2026, growing at 14% per year. Retail, logistics and financial services account for 48% of spend.'],
  ],
  [
    ['h', 'Competitive Landscape'],
    ['p', 'The main competitors in our segment are Lumio, Gridwise and Ardent BI. Lumio wins on price and ease of setup; Gridwise wins enterprise deals that require on-premise deployment; Ardent BI is strongest with finance teams because of its spreadsheet integration.'],
    ['p', 'Helix is most often chosen for governance, permission controls and the quality of its scheduled reporting. We lose most often on time-to-first-dashboard, which averages nine days for Helix against three days for Lumio.'],
  ],
  [
    ['h', 'Key Findings'],
    ['p', 'Finding 1: Buyers rank trustworthy, explainable numbers above advanced visualisation. Finding 2: 63% of interviewees want natural-language search across reports. Finding 3: Data teams are shrinking, so self-service setup matters more than flexibility.'],
    ['h', 'Pricing Sensitivity'],
    ['p', 'Most mid-market buyers expect per-seat pricing between £20 and £35 per user per month. Annual prepayment is acceptable if a discount of at least 10% is offered.'],
    ['h', 'Recommendations'],
    ['p', 'Prioritise guided onboarding to cut time-to-first-dashboard below four days, launch Smart Search v3, and package governance features in a higher tier rather than discounting the core plan.'],
  ],
];

export const customerInterviews = `Company,Segment,Role,Main pain point,Willingness to pay,Quote summary
Brightwell Foods,Retail,Head of Data,Dashboards are rebuilt because nobody can find the originals,High,Wants search that understands business terms
Coastal Freight,Logistics,COO,Weekly reports take two analysts a full day,High,Would pay more for scheduled reporting that just works
Fernhill Insurance,Financial services,Analytics Lead,Needs strict row-level permissions for regulators,Very high,Governance is the deciding factor
Orbit Home,Retail,Ecommerce Director,Too slow to set up the first dashboard,Medium,Chose a cheaper tool last year because setup was faster
Pinnacle Health Supplies,Distribution,Finance Director,Numbers differ between teams,High,Wants one trusted definition of revenue
Riverside Group,Financial services,CFO,Board packs are assembled manually in spreadsheets,High,Would consolidate tools to reduce licence costs
Northgate Retail,Retail,BI Manager,Churn and cancellation dashboards are hard to find,Medium,Search is the biggest daily frustration
Atlas Couriers,Logistics,Operations Analyst,Data team shrank from six to two people,Medium,Needs self-service for operations managers
`;
