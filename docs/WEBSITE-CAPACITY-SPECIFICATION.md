# YUVA FITNESS WEBSITE
# WEBSITE CAPACITY & PERFORMANCE SPECIFICATION

## 1. Purpose

This document defines the measured capacity, performance limits,
mobile reliability requirements, API limits, concurrency expectations,
bottlenecks, failure behavior, and production-readiness status of the
YUVA Fitness website.

The audit must distinguish between measured facts, observations,
recommendations, assumptions, and items that were not tested.

## 2. Audit Rules

- Do not claim unlimited capacity.
- Do not claim 100% stability without evidence.
- Do not modify production code during the audit.
- Do not modify tests just to make them pass.
- Do not compress or replace assets during the audit.
- Do not redesign the website.
- Do not guess unavailable measurements.
- Mark unavailable measurements as NOT MEASURED.
- Separate actual test results from targets and recommendations.

## 3. Project

Project root:

D:\opencode

Known frontend pages:

- index.html
- franchise/gallery.html

Known backend:

- Vercel serverless API handlers

## 4. Initial Measured Findings

### Equipment Images

Total equipment JPG size:
approximately 10.5 MB

enquiry-lat-pulldown-yuva.jpg:
approximately 0.9 MB

chest-press.jpg:
approximately 210 KB

Several equipment images exceed 1 MB.

These assets have NOT been optimized during this audit.