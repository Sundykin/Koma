# Internationalization (i18n) Audit Report

## Executive Summary
The project has an established i18n infrastructure using `react-i18next` with locale files (`zh-CN.json`, `en-US.json`). However, the implementation is inconsistent. A significant portion of the frontend codebase, particularly recent UI components, relies on hardcoded Chinese strings instead of translation keys.

## Findings

### 1. Hardcoded Text Prevalence
-   **Scope**: Found over **2,200 instances** of hardcoded Chinese text in `frontend/src/components` alone.
-   **Key Areas**:
    -   **Editor**: `SimpleEditor`, `SimpleTimeline`, `PropertiesPanel` (labels, tooltips, error messages).
    -   **Assets**: `CharacterDetailModal`, `AssetGenerationWizard` (form labels, status messages).
    -   **Project**: `ProjectOverview`, `EpisodeManager`, `ScriptWorkbench`.
    -   **Storyboard**: `Storyboard.tsx`, `ShotCard.tsx` (action buttons, prompts).
    -   **Settings**: Configuration managers for LLM, TTS, etc.

### 2. Existing Translation Resources
-   `frontend/src/i18n/locales/zh-CN.json`: Contains a structured set of keys for `common`, `project`, `editor`, `asset`, `settings`, etc.
-   **Gap**: Many keys exist in the JSON but are not used in the components (e.g., `common.save` is defined but "保存" is often hardcoded). Conversely, many specific UI strings found in the code are missing from the JSON files.

### 3. Specific Examples of Hardcoded Text
-   **UI Labels**: "保存", "取消", "编辑", "删除", "新建", "上传" (often used directly instead of `t('common.save')` etc.).
-   **Feedback Messages**: `message.success('保存成功')`, `message.error('生成失败')`.
-   **Placeholders**: `placeholder="请输入名称"`.
-   **Tooltips**: `title="点击保存"`.
-   **Business Logic**: Default values in forms (e.g., "主角", "配角").

## Recommendations

1.  **Enforce `t()` Usage**: Systematically replace hardcoded strings with `t('key')` calls in all React components.
2.  **Audit & Sync JSON**:
    -   Verify if existing keys in `zh-CN.json` cover the hardcoded text.
    -   Add missing keys for specific component text.
3.  **Extraction Tooling**: Consider using a tool like `i18next-scanner` or `i18next-parser` to automatically extract hardcoded strings and generate/update JSON files to ensure coverage.
4.  **Code Review**: Make checking for hardcoded strings a part of the code review process for new features.

## Action Plan
1.  Start with `frontend/src/components/common` to fix reusable components.
2.  Move to high-traffic areas like `editor` and `project`.
3.  Extract text to `zh-CN.json` and ensure `en-US.json` is kept in sync (or at least contains the keys).
