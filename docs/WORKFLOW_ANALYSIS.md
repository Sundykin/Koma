# Workflow & Task Queue Management Analysis

## 1. Overview

The current workflow system in Koma is split across multiple components with overlapping responsibilities and inconsistent data models. This leads to fragility, especially regarding task recovery after application restarts, and makes it difficult to maintain a reliable task queue.

## 2. Component Analysis

### 2.1 `WorkflowManager.ts`
*   **Role**: In-memory orchestrator for high-level operations.
*   **Issues**:
    *   **Ephemeral State**: Queue and running state are lost on reload.
    *   **Disconnect**: It doesn't integrate deeply with the persistent `TaskQueueStore`. It essentially fires-and-forgets from a persistence perspective.

### 2.2 `TaskQueueStore.ts`
*   **Role**: Persistence layer (DAL) for `tasks.json`.
*   **Issues**:
    *   **Passive**: It only stores data; it doesn't manage execution.
    *   **Manual Management**: Workflows must manually call `createTask`, `updateTask`, `markTaskCompleted`. This leads to boilerplate and potential inconsistencies (e.g., forgetting to update status on error).

### 2.3 `TaskManager.ts`
*   **Role**: A higher-level service attempting to manage task state and recovery.
*   **Issues**:
    *   **Type Duplication**: Redefines `Task` and `TaskType` interfaces, which are inconsistent with the global `AsyncTask` type used by `TaskQueueStore`.
    *   **Logic Duplication**: Re-implements `loadTasks` and `saveTasks` logic found in `TaskQueueStore`.
    *   **Incomplete**: The polling logic is stubbed out.

### 2.4 `TaskRecoveryService.ts`
*   **Role**: Recovers tasks on startup.
*   **Issues**:
    *   **Provider Ambiguity**: Uses `task.type` (e.g., `'itv'`) to look up progress checkers. Since multiple providers (Kling, Runway) can serve `'itv'`, this is insufficient. It needs to know *which* provider was used for a specific task.

### 2.5 Workflows (e.g., `shotRenderWorkflow.ts`)
*   **Role**: Business logic execution.
*   **Issues**:
    *   **Coupled Execution**: Directly calls Providers and manages Store updates.
    *   **Internal Polling**: Providers like `KlingProvider` block execution with `await` while polling. If the app closes, the loop dies, and the task remains "running" in the store but dead in memory.

## 3. Architecture Problems

1.  **Split Brain**: `WorkflowManager` handles in-memory queues, `TaskQueueStore` handles disk state. They are not synced.
2.  **Zombie Tasks**: Long-running provider calls (polling) are strictly in-memory. A restart kills the polling loop, and the recovery service lacks the specific provider context to resume effectively.
3.  **Type Inconsistency**: `Task` (local) vs `AsyncTask` (global) creates confusion.

## 4. Improvement Suggestions

### 4.1 Unified Task Data Model
*   **Single Source of Truth**: Use `AsyncTask` from `types.ts` everywhere.
*   **Metadata**: Add `providerId` and `providerConfig` to `AsyncTask` metadata to ensure the recovery service knows *how* to check status.

### 4.2 Centralized Task Runner (The "Job Queue" Pattern)
*   **Concept**: Move execution logic out of arbitrary async functions into registered "Task Handlers".
*   **Flow**:
    1.  UI calls `TaskManager.submit(type, payload)`.
    2.  `TaskManager` creates a persistent `pending` task.
    3.  `TaskManager`'s queue processor picks up the task.
    4.  It delegates to a registered `TaskRunner` (e.g., `ITVTaskRunner`).
    5.  `ITVTaskRunner` calls the Provider.
*   **Benefit**: If the app restarts, `TaskManager` sees `pending` tasks and simply re-queues them to the `TaskRunner`.

### 4.3 Provider-Agnostic Recovery
*   **Mechanism**: Providers should implement a standard `checkTaskStatus(remoteId)` method.
*   **Recovery Flow**:
    1.  On startup, load `running` tasks.
    2.  For each task, read `metadata.providerId`.
    3.  Instantiate the Provider.
    4.  Call `provider.checkTaskStatus()`.
    5.  Update persistence or resume polling.

### 4.4 Refactoring Steps

1.  **Standardize Types**: Remove local types in `TaskManager.ts` and use `types.ts`.
2.  **Merge Stores**: Deprecate `TaskQueueStore` and move persistence logic entirely into `TaskManager`.
3.  **Implement Task Runners**:
    *   Create `services/tasks/runners/ITVRunner.ts`.
    *   Move logic from `shotRenderWorkflow.ts` into this runner.
4.  **Enhance Provider Interface**: Ensure all providers expose `checkProgress` and `cancel` methods that are uniform.

## 5. Roadmap

1.  **Immediate**: Fix type inconsistencies in `TaskManager.ts`.
2.  **Short-term**: Update `TaskRecoveryService` to use `providerId` from task metadata for correct checker lookup.
3.  **Long-term**: Re-architect `WorkflowManager` to be a wrapper around `TaskManager`'s persistent queue, removing the in-memory-only queue.
