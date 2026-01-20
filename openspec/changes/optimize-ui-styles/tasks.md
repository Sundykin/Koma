# UI Style Optimization Tasks

## 1. Global Style & Layout Refinement
- [ ] **Update `frontend/src/index.css`**:
    - [ ] Define CSS variables for common colors (bg-primary, bg-secondary, border-color, etc.) to ensure consistency.
    - [ ] Add utility classes for common transitions and glassmorphism effects if not already present in Tailwind config.
- [ ] **Refactor `frontend/src/App.tsx` Layout**:
    - [ ] Improve Sidebar transition: Ensure smooth width transition and content fading.
    - [ ] Enhance Header styling: Add subtle border/shadow and improve breadcrumb typography.
    - [ ] Unify background colors: Ensure `AppContent` and `renderSidebar` use consistent background tokens.

## 2. Project List Optimization
- [ ] **Update `frontend/src/components/ProjectList.tsx`**:
    - [ ] **Card Component**:
        - [ ] Improve hover effects (scale, shadow, border highlight).
        - [ ] Refine the "New Project" card to look more distinct and inviting.
        - [ ] Optimize image aspect ratio and fallback handling.
    - [ ] **Grid Layout**:
        - [ ] Adjust grid columns for better responsiveness on large screens (2xl).
    - [ ] **Search & Filter**:
        - [ ] Style the search input and filter chips to match the new design language.

## 3. Editor UI Polish
- [ ] **Update `frontend/src/editor/ScriptEditor.tsx`**:
    - [ ] Adjust container border and background to match the dark theme palette perfectly.
    - [ ] Ensure the placeholder text color provides good contrast but remains subtle.
- [ ] **Update `frontend/src/App.tsx` (Editor View)**:
    - [ ] Refine the "Smart Analysis" sidebar styling (headers, card spacing, scrollbars).
    - [ ] Improve the bottom status bar in the editor area.

## 4. Navigation & Transitions
- [ ] **Update `frontend/src/components/StepNavigator.tsx`** (if applicable, or inline in App.tsx):
    - [ ] Polish the step progress visual (active state, completed state, lines between steps).
- [ ] **General**:
    - [ ] Add simple fade-in animations for main content area when switching views.

## 5. Verification
- [ ] Verify dark theme consistency across all modified components.
- [ ] Check responsiveness on different window sizes.
