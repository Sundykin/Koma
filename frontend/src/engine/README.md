# Engine Module

The engine module handles media playback, canvas rendering, audio synchronization, keyframe animation, and timeline snapping. It provides both a full-featured engine for the main editor and a simplified version for lightweight editing.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Engine Module                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Main Editor Engines                        │   │
│  │                                                               │   │
│  │  ┌─────────────┐     ┌──────────────┐                        │   │
│  │  │ MediaEngine │     │PlaybackEngine│  ◄── Two engine options│   │
│  │  │ (Timeline)  │     │ (TrackLine)  │                        │   │
│  │  └──────┬──────┘     └──────┬───────┘                        │   │
│  │         │                   │                                 │   │
│  │         ▼                   ▼                                 │   │
│  │  ┌─────────────┐     ┌─────────────┐     ┌────────────┐     │   │
│  │  │VideoRenderer│     │   Canvas    │     │AudioControl│     │   │
│  │  │  (Canvas)   │     │  Rendering  │     │   (Web)    │     │   │
│  │  └─────────────┘     └─────────────┘     └────────────┘     │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Animation System                           │   │
│  │                                                               │   │
│  │  ┌─────────────────────┐     ┌────────────────────────┐     │   │
│  │  │KeyframeInterpolator │     │     keyframe.ts        │     │   │
│  │  │ (Volume + Transform)│     │ (Core animation utils) │     │   │
│  │  └─────────────────────┘     └────────────────────────┘     │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Editing Tools                              │   │
│  │                                                               │   │
│  │  ┌─────────────┐                                             │   │
│  │  │ SnapEngine  │  ◄── Timeline snapping for clip editing    │   │
│  │  └─────────────┘                                             │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Simple Editor Engine                       │   │
│  │                                                               │   │
│  │  ┌─────────────────┐  ┌───────────────────┐  ┌────────────┐ │   │
│  │  │SimpleMediaEngine│  │SimpleVideoRenderer│  │SimpleAudio │ │   │
│  │  │   (Playback)    │  │     (Canvas)      │  │ Controller │ │   │
│  │  └─────────────────┘  └───────────────────┘  └────────────┘ │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `MediaEngine.ts` | Unified playback controller for Timeline model |
| `PlaybackEngine.ts` | Track-based playback for TrackLine/TrackItem model |
| `VideoRenderer.ts` | Canvas rendering for Timeline clips |
| `AudioController.ts` | Multi-track audio playback synchronization |
| `KeyframeInterpolator.ts` | Keyframe interpolation with volume support |
| `keyframe.ts` | Core keyframe animation utilities |
| `SnapEngine.ts` | Timeline snapping logic for editing |
| `simpleEngine.ts` | Standalone engine for simple editor |
| `simpleKeyframe.ts` | Keyframe utilities for simple editor |
| `index.ts` | Module exports |

---

## MediaEngine

Unified playback controller that orchestrates video rendering and audio playback using the `Timeline` model.

### Features

- Coordinates VideoRenderer and AudioController
- Smart media loading (only loads new/changed assets)
- RAF-based playback loop with time delta calculation
- Throttled state updates (~60fps)

### Usage

```typescript
import { MediaEngine } from './engine';

const engine = new MediaEngine();

// Bind canvas
engine.bindCanvas(canvasElement);

// Load timeline
await engine.loadTimeline(timelineData);

// Playback controls
engine.play();
engine.pause();
engine.seek(5000); // ms
engine.togglePlay();

// State
const time = engine.getCurrentTime();
const duration = engine.getDuration();
const isPlaying = engine.getIsPlaying();

// Volume
engine.setVolume(0.8);

// State updates
engine.onUpdate((state) => {
  console.log(`Time: ${state.currentTime}ms, Playing: ${state.isPlaying}`);
});

// Cleanup
engine.dispose();
```

### PlaybackState

```typescript
interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;    // milliseconds
  duration: number;       // milliseconds
  fps: number;
}
```

---

## PlaybackEngine

Alternative playback engine using the `TrackLine`/`TrackItem` model with frame-based timing.

### Features

- Frame-based playback (configurable FPS)
- Built-in media caching (video, audio, image)
- Keyframe interpolation via KeyframeInterpolator
- Seek tolerance to avoid unnecessary seeks
- Duration caching for performance

### Usage

```typescript
import { PlaybackEngine } from './engine';

const engine = new PlaybackEngine();

// Setup
engine.bindCanvas(canvasElement);
engine.setConfig({ fps: 30, width: 1920, height: 1080 });

// Load tracks
await engine.loadTracks(trackLines);

// Frame-based controls
engine.play();
engine.pause();
engine.seekFrame(150);    // Frame number
engine.seekTime(5000);    // Milliseconds

// State
const frame = engine.getCurrentFrame();
const time = engine.getCurrentTime();
const duration = engine.getDuration();

// Subscribe to updates
const unsubscribe = engine.onUpdate((state) => {
  console.log(`Frame: ${state.currentFrame}/${state.duration}`);
});

// Cleanup
engine.dispose();
```

### PlaybackConfig

```typescript
interface PlaybackConfig {
  fps: number;      // Frame rate (default: 30)
  width: number;    // Canvas width (default: 1920)
  height: number;   // Canvas height (default: 1080)
}
```

---

## VideoRenderer

Canvas-based video and image rendering with transformation support.

### Features

- Pre-sorted track rendering (by order)
- Visibility culling (only renders visible clips)
- Keyframe animation interpolation
- Subtitle/text rendering with backgrounds
- Media preloading with koma-local:// protocol

### Usage

```typescript
import { VideoRenderer } from './engine';

const renderer = new VideoRenderer(canvasElement);

// Configure
renderer.setSize(1920, 1080);

// Preload media
await renderer.preloadMedia('/path/to/video.mp4');
await renderer.preloadMedia('/path/to/image.png');

// Render frame
renderer.render(timeline, currentTimeMs);

// Invalidate cache when tracks change
renderer.invalidateTrackCache();

// Cleanup
renderer.dispose();
```

### Rendering Pipeline

```
render(timeline, currentTime)
       │
       ├─► Sort video tracks by order (cached)
       │
       ├─► For each visible clip:
       │   ├─► Calculate clip-local time
       │   ├─► Get keyframe interpolated values
       │   ├─► Apply transformations (translate, rotate, scale, opacity)
       │   ├─► Sync video element currentTime
       │   └─► Draw to canvas
       │
       └─► Render subtitle tracks
```

---

## AudioController

Multi-track audio playback with timeline synchronization.

### Features

- Load audio from Timeline tracks
- Per-clip and per-track muting
- Master volume control
- Time synchronization with tolerance (100ms)
- Play/pause/seek coordination

### Usage

```typescript
import { AudioController } from './engine';

const audio = new AudioController();

// Load all audio from timeline
await audio.loadTimeline(timeline);

// Playback
audio.play();
audio.pause();
audio.seek(5000);

// Volume
audio.setMasterVolume(0.8);
audio.setTrackMuted('track-1', true);

// Time updates (called by MediaEngine)
audio.update(currentTimeMs);

// Cleanup
audio.dispose();
```

---

## Keyframe Animation

### keyframe.ts - Core Utilities

Comprehensive keyframe management with caching and interpolation.

```typescript
import {
  getAnimatedProperties,
  addKeyframe,
  removeKeyframe,
  updateKeyframeTime,
  updateKeyframeEasing,
  updateKeyframeProperties,
  autoKeyframe,
  hasKeyframeAt,
  getKeyframesInRange,
  copyKeyframe,
  easingFunctions,
} from './engine';

// Get interpolated values at time
const props = getAnimatedProperties(keyframes, frameTime, defaults);
// Returns: { x, y, scale, rotation, opacity }

// Add keyframe
const newKeyframes = addKeyframe(keyframes, time, properties, 'ease-in-out');

// Remove keyframe
const filtered = removeKeyframe(keyframes, keyframeId);

// Auto-keyframe (create or update at current time)
const updated = autoKeyframe(keyframes, time, 'scale', 1.5, defaults);

// Check for keyframe at time
const kf = hasKeyframeAt(keyframes, time, threshold);
```

### Easing Functions

```typescript
const easingFunctions = {
  'linear':           (t) => t,
  'ease-in':          (t) => t * t,
  'ease-out':         (t) => t * (2 - t),
  'ease-in-out':      (t) => t < 0.5 ? 2*t*t : -1 + (4-2*t)*t,
  'ease-in-cubic':    (t) => t * t * t,
  'ease-out-cubic':   (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out-cubic': (t) => ...
};
```

### KeyframeInterpolator

Extended interpolator that includes volume for audio keyframes.

```typescript
import { KeyframeInterpolator } from './engine';

const values = KeyframeInterpolator.interpolate(keyframes, time, {
  x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, volume: 1
});
// Returns: KeyframeValues including volume

// Check for keyframe at time
const kf = KeyframeInterpolator.hasKeyframeAt(keyframes, time, threshold);

// Get keyframes in range
const range = KeyframeInterpolator.getKeyframesInRange(keyframes, startTime, endTime);
```

---

## SnapEngine

Timeline snapping for precise clip editing.

### Features

- Snap to playhead, clip edges, grid
- Configurable threshold and scale
- Multi-position snapping (start and end)
- Visible snap line queries for UI

### Usage

```typescript
import { snapEngine, SnapEngine } from './engine';

// Configure
snapEngine.setOptions({
  enabled: true,
  threshold: 10,        // pixels
  scale: 1,             // current zoom level
  snapToPlayhead: true,
  snapToClipEdge: true,
  snapToGrid: false,
  gridInterval: 30,     // frames
});

// Update snap points from tracks
snapEngine.updateFromTracks(tracks, playheadTime);

// Find snap position
const result = snapEngine.findSnapPosition(dragPosition, excludeItemId);
if (result.snapped) {
  console.log(`Snapped to ${result.snapPoint.type} at frame ${result.position}`);
}

// Find best snap for start/end
const { snapType, result } = snapEngine.findBestSnap(
  { start: itemStart, end: itemEnd },
  itemId
);

// Get visible snap lines for rendering
const lines = snapEngine.getVisibleSnapLines({ start: 0, end: 1000 });
```

### SnapPoint Types

```typescript
type SnapPointType =
  | 'playhead'    // Current playhead position
  | 'item-start'  // Clip start edge
  | 'item-end'    // Clip end edge
  | 'marker'      // Timeline marker
  | 'grid';       // Grid line
```

---

## Simple Editor Engine

Standalone engine for the simple editor view, isolated from the main system.

### SimpleMediaEngine

Basic playback controller with event-based communication.

```typescript
import { SimpleMediaEngine } from './engine/simpleEngine';

const engine = new SimpleMediaEngine(60); // duration in seconds

// Events
engine.on('play', (e) => console.log('Playing at', e.time));
engine.on('pause', (e) => console.log('Paused at', e.time));
engine.on('seek', (e) => console.log('Seeked to', e.time));
engine.on('timeUpdate', (e) => updateUI(e.time));
engine.on('ended', (e) => console.log('Playback ended'));
engine.on('rateChange', (e) => console.log('Rate:', e.rate));

// Controls
engine.play();
engine.pause();
engine.seek(10.5);
engine.setPlayRate(1.5);

// State
console.log(engine.time, engine.duration, engine.isPlaying);

// Cleanup
engine.destroy();
```

### SimpleVideoRenderer

Canvas renderer for the simple editor.

```typescript
import { SimpleMediaEngine, SimpleVideoRenderer } from './engine/simpleEngine';

const engine = new SimpleMediaEngine(60);
const renderer = new SimpleVideoRenderer(engine, canvasElement);

// Set tracks (auto-preloads media)
renderer.setTracks(tracks);

// Get video element for external use
const video = renderer.getVideoElement('clip-1');

// Cleanup
renderer.destroy();
```

### SimpleAudioController

Audio management for the simple editor with shared video element support.

```typescript
import { SimpleMediaEngine, SimpleAudioController } from './engine/simpleEngine';

const engine = new SimpleMediaEngine(60);
const audio = new SimpleAudioController(engine);

// Set tracks for mute state tracking
audio.setTracks(tracks);

// Load audio clips
audio.loadClip(audioClip);

// Video elements are shared from VideoRenderer
renderer.setAudioController(audio);

// Volume/mute
audio.setMasterVolume(0.8);
audio.setMuted('clip-1', true);
audio.setTrackMuted('track-1', true);

// Cleanup
audio.destroy();
```

---

## Performance Optimizations

### RAF Loop

Both engines use `requestAnimationFrame` with arrow functions to maintain `this` context:

```typescript
private _tick = (timestamp: number): void => {
  if (!this.isPlaying) return;

  const delta = timestamp - this.lastFrameTime;
  this.lastFrameTime = timestamp;

  // Update and render
  this.currentTime += delta;
  this.render();

  this.animationFrameId = requestAnimationFrame(this._tick);
};
```

### State Update Throttling

State callbacks are throttled to ~60fps to prevent excessive re-renders:

```typescript
private static readonly EMIT_INTERVAL = 16; // ~60fps

if (timestamp - this._lastEmitTime >= EMIT_INTERVAL) {
  this._lastEmitTime = timestamp;
  this.emitState();
}
```

### Media Caching

- Pre-sorted track arrays cached until invalidated
- Keyframe sort results cached with WeakMap
- Duration computed once and cached
- Media elements reused across timeline changes

### Video Sync Tolerance

Avoid seek operations for small time differences:

```typescript
// Only seek if difference > 100ms
if (Math.abs(video.currentTime * 1000 - sourceTime) > 100) {
  video.currentTime = sourceTime / 1000;
}
```

---

## Local File Protocol

Media files are loaded using the `koma-local://` protocol for Electron compatibility:

```typescript
const mediaUrl = `koma-local:///${path.replace(/\\/g, '/')}`;
```

This is handled by Electron's protocol handler to serve local files securely.

---

## Type Definitions

### Timeline Model (MediaEngine)

```typescript
interface Timeline {
  id: string;
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  tracks: Track[];
}

interface Track {
  id: string;
  type: 'video' | 'audio' | 'subtitle';
  clips: Clip[];
  visible: boolean;
  muted: boolean;
  order?: number;
}

interface Clip {
  id: string;
  startTime: number;
  duration: number;
  sourcePath: string;
  sourceStart?: number;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  opacity: number;
  keyframes: Keyframe[];
}
```

### TrackLine Model (PlaybackEngine)

```typescript
interface TrackLine {
  id: string;
  type: 'video' | 'audio' | 'image' | 'text';
  items: TrackItem[];
  visible: boolean;
  muted: boolean;
  order: number;
}

interface TrackItem {
  id: string;
  type: 'video' | 'audio' | 'image' | 'text';
  start: number;      // Frame
  end: number;        // Frame
  offsetL: number;    // Left trim offset
  source?: string;
  keyframes?: TrackKeyframe[];
}
```
