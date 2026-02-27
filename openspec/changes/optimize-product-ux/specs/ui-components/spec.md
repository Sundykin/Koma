## ADDED Requirements

### Requirement: Onboarding Tour
The system SHALL provide a step-by-step guided tour for first-time users that introduces the core workflow: project creation, script input, AI service configuration, asset generation, storyboarding, and video editing.

#### Scenario: First launch onboarding
- **WHEN** user opens Koma Studio for the first time (no localStorage flag)
- **THEN** an overlay tour highlights key UI elements in sequence
- **THEN** user can skip the tour at any step

#### Scenario: Re-trigger onboarding
- **WHEN** user clicks "重新显示引导" in Settings
- **THEN** the onboarding tour restarts from the beginning

### Requirement: Batch Operation Controls
The system SHALL provide pause, resume, and cancel controls during batch generation operations. Each item in the batch MUST display its individual status.

#### Scenario: User pauses batch generation
- **WHEN** user clicks "暂停" during batch image generation
- **THEN** the current item finishes but no new items start
- **THEN** a "继续" button appears to resume

#### Scenario: User cancels batch generation
- **WHEN** user clicks "取消" during batch generation
- **THEN** the current item finishes and remaining items are marked as "已取消"

#### Scenario: Individual retry after batch failure
- **WHEN** a batch generation completes with some failed items
- **THEN** each failed item shows a retry button
- **THEN** user can retry individual items without re-running the entire batch

### Requirement: Storyboard Drag-and-Drop Reordering
The system SHALL allow users to reorder storyboard shots via drag-and-drop. The new order MUST be persisted automatically.

#### Scenario: User drags a shot to a new position
- **WHEN** user drags shot #3 above shot #1
- **THEN** shots reorder to: former #3, former #1, former #2
- **THEN** the new order is saved to the project file

### Requirement: Project Templates
The system SHALL offer predefined project templates (e.g., short drama, narration, advertisement) during project creation. Selecting a template MUST pre-fill project settings.

#### Scenario: User creates project from template
- **WHEN** user selects "短剧模板" in the create project dialog
- **THEN** genre, episode count, style prompt, and sample script are pre-filled
- **THEN** user can modify any pre-filled value before confirming
