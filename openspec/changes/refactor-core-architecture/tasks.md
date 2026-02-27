## 1. Foundation & Contracts
- [ ] 1.1 Define unified architecture boundaries and publish module ownership map (Main vs Renderer vs Shared).
- [ ] 1.2 Introduce type-safe IPC RPC contract conventions (`domain:action`) and structured error envelope.
- [ ] 1.3 Establish cross-process Event Bus contract (event naming, payload typing, error isolation).

## 2. Persistence & Configuration Consolidation
- [ ] 2.1 Implement Persistence Layer with repository interface (`find`, `findById`, `save`, `delete`, `list`) for each core entity.
- [ ] 2.2 Move file I/O fully to main process and replace renderer direct file access paths with IPC calls.
- [ ] 2.3 Add cache + write queue (debounce merge) + migration hooks + transactional batch operation semantics.
- [ ] 2.4 Consolidate settings/config logic into backend Config System with schema validation and import/export support.

## 3. Provider/Plugin/Agent/Workflow Core Refactor
- [ ] 3.1 Unify Provider Registry between frontend/backend and support health check + fallback strategy.
- [ ] 3.2 Refactor Plugin Runtime to sandbox execution (Worker/iframe), message-channel host API, and centralized lifecycle state.
- [ ] 3.3 Consolidate Agent/Chat to backend-only execution with streaming, tool registry, retry, session persistence, and branching.
- [ ] 3.4 Refactor Workflow Engine to backend DAG execution with parallel scheduling, HITL gates, retry, cancellation, and recovery.

## 4. Frontend Decoupling & Domain Modeling
- [ ] 4.1 Split frontend Zustand stores by domain and separate UI transient state from business state.
- [ ] 4.2 Refactor high-coupling components (including Storyboard flows) to hook/store-driven data access; reduce callback prop chains.
- [ ] 4.3 Decompose monolithic type definitions into domain modules and add shared-types package for cross-process types.
- [ ] 4.4 Add Zod schemas at system boundaries and infer TypeScript types from schemas.

## 5. Validation & Rollout Safety
- [ ] 5.1 Add contract tests for IPC/Event Bus and round-trip consistency tests for repositories.
- [ ] 5.2 Add workflow resilience tests (retry, pause/resume, crash recovery) and agent integration tests (streaming/tool call failure).
- [ ] 5.3 Add phased migration checks, compatibility verification, and operational runbook for rollback paths.
- [ ] 5.4 Run full strict spec validation and ensure all acceptance scenarios map to executable verification items.
