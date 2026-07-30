# Fiteatsy — 03 Backend

**Document Group:** Backend Engineering Architecture  
**Product:** Fiteatsy  
**Status:** Implementation Baseline + Target Direction

## Purpose

This package defines what the Fiteatsy backend is responsible for, what the mobile app may own, how backend modules should be separated, and how the current Node/Express implementation can evolve without prematurely creating microservices.

## Current Evidence Baseline

The current repository contains a Node + Express + TypeScript backend. Phase 1B introduced a PostgreSQL persistence foundation, durable opaque sessions, Bearer authentication, and PostgreSQL-backed platform repositories. Full runtime verification remains dependent on a reachable PostgreSQL deployment.

## Documents

- `BACKEND_AUTHORITY.md`
- `MODULAR_BACKEND_ARCHITECTURE.md`
- `API_AND_SERVICE_CONTRACT_PRINCIPLES.md`
- `BACKGROUND_PROCESSING.md`
- `BACKEND_SECURITY_BOUNDARIES.md`
- `FAILURE_AND_RESILIENCE_MODEL.md`
- `BACKEND_EVOLUTION_PLAN.md`

## Core Rule

The backend is the authority for durable Fiteatsy state. AsyncStorage and other device storage may support UX, caching and offline continuity, but must not become an alternative source of truth for server-owned state.
