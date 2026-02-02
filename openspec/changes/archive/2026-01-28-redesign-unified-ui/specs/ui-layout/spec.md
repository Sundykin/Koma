## MODIFIED Requirements

### Requirement: Application Layout Structure
The application SHALL use a two-column layout with collapsible sidebar and main content area.

#### Scenario: Default Layout
- **WHEN** application loads
- **THEN** display 72px-wide sidebar on the left
- **AND** main content area fills remaining width
- **AND** no independent header bar is rendered

#### Scenario: Editor View Layout
- **WHEN** user is in editor view with active project
- **THEN** StepNavigator SHALL be rendered at the top of main content area
- **AND** StepNavigator height SHALL be 56px
- **AND** content area SHALL fill remaining vertical space

#### Scenario: Settings View Layout
- **WHEN** user navigates to settings
- **THEN** display nested sidebar within main content area (240px width)
- **AND** settings content fills remaining width
- **AND** no global header is shown

## ADDED Requirements

### Requirement: Contextual Page Header
Each page SHALL include a contextual header integrated into its content area when actions are needed.

#### Scenario: ProjectList Page Header
- **WHEN** displaying project list
- **THEN** render inline toolbar with title "我的项目"
- **AND** include search input, filter buttons, and create button
- **AND** toolbar height SHALL be 56px

#### Scenario: ProjectOverview Page Header
- **WHEN** displaying project overview
- **THEN** render project title with edit capability
- **AND** include project tags (genre, mode, theme)
- **AND** include action buttons (导入剧本, 设置)

#### Scenario: Editor Page Header
- **WHEN** displaying editor view
- **THEN** StepNavigator serves as page header
- **AND** step labels are: 剧本解析, 角色场景, AI分镜, 后期剪辑
- **AND** action button reflects current step context

### Requirement: Task Status Notification
Task progress SHALL be displayed as a floating notification instead of a fixed bar.

#### Scenario: Active Task Display
- **WHEN** background task is running
- **THEN** display floating notification in bottom-right corner
- **AND** show task name, progress percentage, and expand button
- **AND** notification width SHALL be 320px max

#### Scenario: No Active Tasks
- **WHEN** no background tasks are running
- **THEN** hide task notification completely
