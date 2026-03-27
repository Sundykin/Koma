## ADDED Requirements
### Requirement: Transition Preview And Export Semantic Alignment
The system MUST keep preview playback and export playback semantically aligned for supported fade transitions.

#### Scenario: Visible overlap uses the same semantic boundary
- **WHEN** two adjacent clips are connected by a supported fade transition
- **THEN** preview and export SHALL expose the same visible clip set for the same timestamp inside the overlap window

#### Scenario: Overlap opacity uses the same semantic boundary
- **WHEN** preview and export render the same supported fade transition at the same timestamp
- **THEN** both paths SHALL apply the same transition opacity semantics
- **AND** this requirement SHALL include text clips, not only image or video clips
