# Video Editor Capability

## ADDED Requirements

### Requirement: Complete Keyframe Animation System
The editor MUST support a full keyframe animation system with interpolation.

#### Scenario: User creates keyframe animation
- Given a selected clip on the timeline
- When user right-clicks and selects "Add Keyframe"
- Then a keyframe is created at the current time with current clip properties
- And the keyframe appears as a diamond marker on the clip

#### Scenario: User edits keyframe properties
- Given a clip with at least two keyframes
- When user modifies properties in the Properties Panel
- Then a new keyframe is automatically created at current time (auto-keyframe)
- And the animation interpolates between keyframes during playback

### Requirement: Properties Panel
The editor MUST have a properties panel for editing clip properties.

#### Scenario: User edits clip properties
- Given a selected clip
- When user adjusts scale/position/rotation/opacity sliders
- Then the clip preview updates in real-time
- And the changes are persisted to the clip data

### Requirement: Sidebar Asset Library
The editor MUST have a sidebar for managing and dragging assets.

#### Scenario: User drags asset to timeline
- Given assets displayed in the sidebar
- When user drags an asset to the timeline
- Then a new clip is created at the drop position
- And collision detection prevents overlapping clips

### Requirement: Timeline Context Menu
The timeline MUST support right-click context menus.

#### Scenario: User accesses clip context menu
- Given a clip on the timeline
- When user right-clicks the clip
- Then a context menu appears with options: Add Keyframe, Copy, Delete

### Requirement: Track Gap Drop
Users MUST be able to create new tracks by dropping clips to gaps.

#### Scenario: User drops clip to track gap
- Given an existing track layout
- When user drags a clip to the gap between tracks
- Then a new track is created
- And the clip is placed on the new track

## MODIFIED Requirements

### Requirement: File Protocol Handling
Local file paths MUST be converted to koma-local protocol.

#### Scenario: Local media file loads correctly
- Given a clip with local file path
- When the clip is rendered in the player
- Then the path is converted to koma-local protocol
- And the media loads without file protocol security errors

### Requirement: Antd Modal API Update
Modal components MUST use destroyOnHidden instead of deprecated destroyOnClose.

#### Scenario: Modal opens and closes without warnings
- Given any Modal component in the app
- When the modal is opened and closed
- Then no deprecation warnings appear in console
- And modal content is properly destroyed when hidden
