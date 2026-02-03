# Plugin System Architecture Review & Improvement Suggestions

## 1. Overview

The current Koma plugin system (`@koma/plugin-sdk`) provides a solid foundation for extending the application's capabilities. It supports various plugin categories (Providers, Global, Tools, MCP, Agents) and offers a comprehensive API for interacting with the core application.

## 2. Strengths

*   **Type Safety**: The SDK utilizes TypeScript extensively, exporting robust type definitions for all major components and APIs.
*   **Modular API**: The `PluginAPI` is well-structured into namespaces (`core`, `settings`, `storage`, etc.), improving discoverability and ease of use.
*   **Provider Pattern**: The factory-based provider instantiation with sandboxed contexts allows for secure and flexible integration of external services.
*   **Manifest Metadata**: The `PluginManifest` structure allows for rich metadata, enabling the system to understand plugin capabilities without loading the entire runtime.

## 3. Areas for Improvement

### 3.1 Runtime Validation
*   **Issue**: While TypeScript provides build-time safety, there is no explicit runtime validation mechanism exposed for plugin configurations.
*   **Suggestion**: Integrate a runtime schema validator (like `zod` or `ajv`) into the SDK.
    *   Export a `defineConfigSchema` helper.
    *   Validate `PluginManifest` upon loading.
    *   Validate user configuration against the provider's `configSchema` before passing it to the factory.

### 3.2 Security & Sandboxing
*   **Issue**: The `storage` API relies on path strings. While "storage:limited" scope exists, strictly enforcing path isolation (chroot) is critical to prevent plugins from accessing arbitrary files.
*   **Suggestion**:
    *   Implement strict path normalization and validation in the host implementation of `PluginAPI.storage`.
    *   Consider using opaque handles or standard `FileSystemHandle` API instead of raw paths for better forward compatibility with web security models.

### 3.3 Backend Plugin Model
*   **Issue**: The `backend` field in `PluginEntry` suggests backend capabilities, but the execution model (Process vs. Thread vs. Main Process) is implicit.
*   **Suggestion**: Explicitly define the backend execution model.
    *   If running in the main process, provide a strict subset of Electron/Node APIs.
    *   If using child processes, provide a standardized IPC channel (e.g., `api.backend.send()`) in the SDK.

### 3.4 UI Extensibility
*   **Issue**: The `ui` API (`showMessage`, `showModal`) is relatively basic.
*   **Suggestion**: Expand the UI capabilities to allow more native-like integrations.
    *   **Toast/Notifications**: With actions (e.g., "Retry", "View").
    *   **Panels**: Allow registering custom sidebars or bottom panels, not just modals.
    *   **Status Bar**: API to add items to the application status bar.

### 3.5 State Persistence
*   **Issue**: Plugins currently use `api.storage` (files) or `api.settings` (global config) to save state. There isn't a dedicated lightweight key-value store for internal plugin state (e.g., "last sync time", "window position").
*   **Suggestion**: Add `api.state` for simple KV persistence that doesn't clutter user settings or require manual file parsing.

## 4. Proposed Changes to SDK

### 4.1 Update `PluginManifest`
Add a `dependencies` field to manage inter-plugin requirements.

```typescript
export interface PluginManifest {
  // ... existing fields
  dependencies?: Record<string, string>; // pluginId -> version range
}
```

### 4.2 Enhanced `PluginContext`
Wrap the API in a context object for lifecycle hooks, providing static info.

```typescript
export interface PluginContext {
  id: string;
  dir: string; // Plugin root directory
  api: PluginAPI;
}

export interface PluginExports {
  onActivate?: (ctx: PluginContext) => void | Promise<void>;
  // ...
}
```

### 4.3 Schema Helper (New Module `schema.ts`)

```typescript
import { z } from 'zod';
export const ConfigSchema = z.object({ ... });
```

## 5. Implementation Roadmap

1.  **Phase 1 (SDK Enhancement)**: Add `dependencies` to manifest, introduce `PluginContext`, and expand `ui` types.
2.  **Phase 2 (Runtime Hardening)**: Implement schema validation in the host loader and strict path checking in storage implementation.
3.  **Phase 3 (Backend Integration)**: Formalize the IPC channel for backend plugins.

