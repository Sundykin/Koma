# Plugin System Architecture Analysis

## Overview
The Koma plugin system (`frontend/src/services/plugin`) implements a dynamic, capability-based extension mechanism for an Electron application. It features a lifecycle manager, a permission-based API layer, and a security sandbox.

## Core Components

1.  **PluginLoader**: 
    -   Uses a custom UMD/IIFE loader via `<script>` injection and a custom `koma-local://` protocol.
    -   Manages module caching and validation.
2.  **PluginInitializer**:
    -   Orchestrates startup, including backend activation via IPC.
    -   Handles store reconciliation to keep state consistent with disk.
3.  **PluginAPI**:
    -   Provides a facade for system services (`settings`, `storage`, `ui`, `channels`).
    -   Implements "Provider Injection" allowing plugins to register capabilities dynamically.
4.  **PluginSandbox**:
    -   Implements permission checks (`scopes`).
    -   Provides path validation (`chroot` logic for storage).
    -   Wraps sensitive APIs like `fetch`.

## Strengths
-   **Granular Permissions**: The `scopes` system (e.g., `network:external`, `storage:limited`) provides clear boundaries for what a plugin can do.
-   **Clean API Design**: The `PluginAPI` is well-structured, making it easy for developers to discover features.
-   **Hybrid Entry Points**: Supports `ui`, `logic`, and `backend` entries, catering to different plugin types (UI widgets vs. background services).

## Critical Areas for Improvement

### 1. Execution Isolation (Security)
**Current State**: Plugins are loaded via `<script>` tags into the main window context. 
**Risk**: Despite `PluginSandbox` defining `BLOCKED_APIS`, the code actually runs with full access to the global `window` object. A malicious plugin can easily bypass the "sandbox" by accessing the real `fetch` or `localStorage` from the global scope before the sandbox proxy is applied, or by accessing other global variables.
**Suggestion**: 
-   **iframe Isolation**: Load UI plugins inside an `<iframe>` (possibly same-origin with sandbox attributes) to strictly enforce JS execution boundaries.
-   **ShadowRealm / eval**: If iframes are too heavy, use `new Function('window', ..., code)(fakeWindow, ...)` to execute code in a closure that shadows globals, though this doesn't prevent all access (e.g. via prototypes).

### 2. Style Isolation
**Current State**: Plugins render into the main DOM.
**Risk**: CSS collisions. Plugin styles can bleed into the app, and app styles can break plugins.
**Suggestion**: Wrap plugin UI roots in a **Shadow DOM**. This provides native CSS scoping.

### 3. Dependency Management
**Current State**: Plugins load in an arbitrary order (based on the list).
**Risk**: If Plugin A depends on a Provider registered by Plugin B, A might fail if it initializes first.
**Suggestion**: Add a `dependencies` field to `manifest.json`. `PluginInitializer` should topologically sort the load queue based on these dependencies.

### 4. Backend Security
**Current State**: Backend activation sends the manifest to the main process via IPC.
**Risk**: If the renderer is compromised, it could instruct the main process to load arbitrary code as a "plugin".
**Suggestion**: The main process should verify the plugin's integrity (signature or hash) on disk independently before loading any backend code, rather than trusting the manifest sent from the renderer.

## Code Quality Notes
-   **Error Handling**: `loadUMDModule` uses a global variable attachment pattern. This is fragile if the plugin throws errors during evaluation or fails to attach. Using `define` (AMD style) or `System.register` might be more robust.
-   **Type Safety**: The system is well-typed with TypeScript, which is excellent.

## Action Plan
1.  **Immediate**: Wrap `loadUMDModule` execution in a closure to shadow `window` and restricted globals to improve basic security.
2.  **Short-term**: Implement Shadow DOM wrappers for UI plugins.
3.  **Long-term**: Move to a Worker/iframe-based architecture for strict isolation.
