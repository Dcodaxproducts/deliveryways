# FeastFlow Brand Decontamination Design

**Spec**: `.specs/features/feastflow-brand-decontamination/spec.md`
**Status**: Approved by the user's explicit cleanup request

## Architecture Overview

This is a cross-repository identity replacement with no new runtime architecture. Existing branding providers, global settings, metadata declarations, PDF/email builders, deployment scripts, and tests remain in place; only their copied defaults, identifiers, fixtures, and assets change.

## Components

| Component | Location | Change |
| --- | --- | --- |
| API identity and defaults | `src/`, `prisma/`, `scripts/`, `deploy/` | Replace brand output, fixtures, resource names, domains, and operational targets. |
| Restaurant Admin identity | `feastflow-restaurant-admin` | Replace metadata, logo fallback, storage/event keys, print labels, package identity, and fixtures. |
| Customer identity | `feastflow-customer-website` | Replace metadata, logo fallback, storage/event keys, domains, package identity, and fixtures. |
| Superadmin identity | `feastflow-superadmin` | Replace metadata, logos, domain labels, locale key, defaults, and fixtures. |
| Landing identity | `feastflow-landing-page` | Replace metadata, official logo/icon, API defaults, storage keys, and settings defaults. |

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Logo source | Existing official FeastFlow live asset | Reuses the established brand rather than inventing a new mark. |
| Browser identifiers | Rename to `feastflow` namespace | Prevents cross-product state leakage on shared browsers/domains. |
| Test domains | FeastFlow platform namespace or RFC-reserved examples | Removes client identity while preserving domain behavior coverage. |
| Provisioner inputs | FeastFlow defaults plus explicit server/webspace inputs | Prevents accidental targeting of unrelated infrastructure. |
| Historical feature docs | Retain behavior knowledge but neutralize copied identity/client names | Preserves engineering context without retaining client data. |

## Error Handling

| Scenario | Handling |
| --- | --- |
| Required custom-domain target is absent | Provisioner exits before mutation with an explicit error. |
| Existing Plesk hostname belongs elsewhere | Provisioner refuses to overwrite unmanaged/foreign configuration. |
| A copied reference remains | Exhaustive tracked-file scan fails verification. |
