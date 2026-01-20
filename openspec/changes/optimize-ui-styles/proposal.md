# UI Style Optimization Proposal

## 1. Background
The current UI implementation in `App.tsx` and related components contains a mix of inline styles, Tailwind CSS classes, and Ant Design components. While functional, the visual consistency and user experience can be improved. The dark theme implementation needs to be unified across different parts of the application (React components, Ant Design, CodeMirror).

## 2. Goals
- **Unify Design System**: Establish a consistent dark theme palette using Tailwind CSS variables and Ant Design tokens.
- **Enhance Layout**: Improve the responsiveness and transition effects of the main layout (Sidebar, Header, Main Content).
- **Polish Key Components**: Refine the visual style of the Project List, Script Editor, and Navigation elements.
- **Improve UX**: Add better interactive feedback (hover states, transitions) and visual hierarchy.

## 3. Proposed Changes

### 3.1 Global Theme & Layout (`App.tsx`, `index.css`)
-   **Theme Config**: Centralize color definitions (backgrounds, borders, primary colors) to ensure consistency between Tailwind and Ant Design.
-   **Sidebar**: Optimize the collapse/expand animation and styling. Ensure the "AiDrama" logo and user profile section transition smoothly.
-   **Header**: Clean up the breadcrumb and action button area. Make the navigation more intuitive.

### 3.2 Project List (`components/ProjectList.tsx`)
-   **Card Design**: Enhance the project card with better aspect ratios, cover image handling, and status badges.
-   **Grid Layout**: Optimize the responsive grid for different screen sizes.
-   **Empty State**: Improve the "No Projects" empty state with better visuals and clear calls to action.

### 3.3 Script Editor Integration (`editor/ScriptEditor.tsx`)
-   **Container Styling**: Ensure the CodeMirror container blends seamlessly with the application background.
-   **Toolbar**: If applicable, style the editor toolbar to match the application theme.

### 3.4 Navigation & Feedback
-   **Step Navigator**: Refine the step progress indicator in the editor view.
-   **Transitions**: Add subtle entry animations for view switching (e.g., fading between Projects and Editor views).

## 4. Impact
-   **Affected Specs**: `ui-style` (new capability)
-   **Affected Code**: `frontend/src/App.tsx`, `frontend/src/index.css`, `frontend/src/components/ProjectList.tsx`, `frontend/src/editor/ScriptEditor.tsx`, `frontend/src/components/StepNavigator.tsx`
