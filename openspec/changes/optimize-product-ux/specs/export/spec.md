## MODIFIED Requirements

### Requirement: Video Export Pipeline
The system SHALL export the timeline as a playable video file using FFmpeg encoding via the Electron backend. The export MUST support H.264 MP4 format with configurable resolution and quality.

#### Scenario: Standard video export
- **WHEN** user clicks "导出" and selects 1080p standard quality
- **THEN** the system renders frames from the Canvas
- **THEN** frames are sent to Electron via IPC for FFmpeg encoding
- **THEN** a progress bar shows current frame / total frames and estimated time remaining
- **THEN** the exported MP4 file is saved to the user-selected path

#### Scenario: Export with quality presets
- **WHEN** user selects "快速" quality preset
- **THEN** the system uses lower bitrate and faster encoding preset (ultrafast)
- **WHEN** user selects "高质量" preset
- **THEN** the system uses higher bitrate and slower encoding preset (slow)

#### Scenario: Export cancellation
- **WHEN** user clicks "取消" during export
- **THEN** encoding stops and partial output file is cleaned up
