import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '../types';
import { MediaType } from '../types/editor';

const { loadEpisodeShotsMock, loadProjectMock, loadShotMetaMock } = vi.hoisted(() => ({
  loadEpisodeShotsMock: vi.fn(),
  loadProjectMock: vi.fn(),
  loadShotMetaMock: vi.fn(),
}));

vi.mock('../store/projectStore', () => ({
  loadEpisodeShots: loadEpisodeShotsMock,
  loadProject: loadProjectMock,
  loadShotMeta: loadShotMetaMock,
}));

vi.mock('./electronService', () => ({
  electronService: {
    isElectron: () => false,
    fs: {
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      copy: vi.fn(),
      downloadFile: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

vi.mock('./draftExport', () => ({
  JianyingExporter: class {},
}));

vi.mock('./simpleExportRenderer', () => ({
  SimpleExportRenderer: class {
    onProgress() {}
    async export() {}
  },
}));

vi.mock('../components/editor/aspectRatio', () => ({
  getCanvasSize: () => ({ width: 1920, height: 1080 }),
}));

import {
  buildShotManifest,
  buildStoryboardAuxiliaryTracks,
  buildStoryboardSubtitleContent,
  buildStoryboardTracks,
  getShotMediaSource,
} from './StoryboardExportService';

function createShot(partial: Partial<Shot>): Shot {
  return {
    id: partial.id || 'shot-1',
    scriptContent: partial.scriptContent || '',
    imagePrompt: partial.imagePrompt || '',
    videoPrompt: partial.videoPrompt || '',
    shotType: partial.shotType || 'medium',
    cameraMovement: partial.cameraMovement || 'static',
    duration: partial.duration ?? 5,
    characters: partial.characters || [],
    scenes: partial.scenes || [],
    props: partial.props || [],
    media: partial.media,
    dialogue: partial.dialogue,
    confirmed: partial.confirmed,
    imageMode: partial.imageMode || 'normal',
    emotion: partial.emotion,
  } as Shot;
}

describe('StoryboardExportService', () => {
  beforeEach(() => {
    loadEpisodeShotsMock.mockReset();
    loadProjectMock.mockReset();
    loadShotMetaMock.mockReset();
  });

  it('prefers the selected video source and falls back to image when needed', () => {
    const shotWithVideo = createShot({
      media: {
        videos: [
          { localPath: '/tmp/video-a.mp4', durationMs: 2400 },
          { localPath: '/tmp/video-b.mp4', durationMs: 4800 },
        ],
        currentVideoIndex: 1,
        images: [
          { localPath: '/tmp/image-a.png' },
        ],
      } as any,
    });

    const shotWithImage = createShot({
      media: {
        images: [
          { localPath: '/tmp/image-only.png' },
        ],
        currentImageIndex: 0,
      } as any,
    });

    expect(getShotMediaSource(shotWithVideo)).toEqual({
      type: 'video',
      path: '/tmp/video-b.mp4',
      url: '/tmp/video-b.mp4',
      durationSeconds: 4.8,
    });

    expect(getShotMediaSource(shotWithImage)).toEqual({
      type: 'image',
      path: '/tmp/image-only.png',
      url: '/tmp/image-only.png',
    });
  });

  it('builds a manifest with durations, subtitles and missing-media flags', async () => {
    loadEpisodeShotsMock.mockResolvedValueOnce([
      createShot({
        id: 'shot-video',
        scriptContent: '视频分镜',
        dialogue: '第一句字幕',
        duration: 3,
        media: {
          videos: [{ localPath: '/tmp/shot-video.mp4', durationMs: 6200 }],
          currentVideoIndex: 0,
        } as any,
      }),
      createShot({
        id: 'shot-image',
        scriptContent: '图片分镜',
        duration: 7,
        media: {
          images: [{ localPath: '/tmp/shot-image.png' }],
          currentImageIndex: 0,
        } as any,
      }),
      createShot({
        id: 'shot-empty',
        scriptContent: '空分镜',
        duration: 4,
      }),
    ]);

    const manifest = await buildShotManifest({
      projectId: 'project-1',
      episodeId: 'episode-1',
    });

    expect(loadEpisodeShotsMock).toHaveBeenCalledWith('project-1', 'episode-1');
    expect(manifest.totalDuration).toBe(17);
    expect(manifest.shots).toHaveLength(3);
    expect(manifest.shots[0]).toEqual(expect.objectContaining({
      subtitle: '第一句字幕',
      duration: 6,
      hasMissingMedia: false,
    }));
    expect(manifest.shots[1]).toEqual(expect.objectContaining({
      subtitle: '图片分镜',
      duration: 7,
      hasMissingMedia: false,
    }));
    expect(manifest.shots[2]).toEqual(expect.objectContaining({
      subtitle: '空分镜',
      hasMissingMedia: true,
      media: { type: 'none' },
    }));
  });

  it('supports exporting a non-contiguous selection by shot id', async () => {
    loadEpisodeShotsMock.mockResolvedValueOnce([
      createShot({ id: 'shot-1', scriptContent: '第一条', media: { images: [{ localPath: '/tmp/1.png' }] } as any }),
      createShot({ id: 'shot-2', scriptContent: '第二条', media: { images: [{ localPath: '/tmp/2.png' }] } as any }),
      createShot({ id: 'shot-3', scriptContent: '第三条', media: { images: [{ localPath: '/tmp/3.png' }] } as any }),
    ]);

    const manifest = await buildShotManifest({
      projectId: 'project-1',
      episodeId: 'episode-1',
      range: { shotIds: ['shot-1', 'shot-3'] },
    });

    expect(manifest.shots.map((item) => item.shot.id)).toEqual(['shot-1', 'shot-3']);
  });

  it('builds storyboard tracks while skipping missing-media shots and emitting subtitles', () => {
    const manifest = {
      shots: [
        {
          index: 0,
          shot: createShot({ id: 'shot-image', scriptContent: '图像分镜' }),
          media: { type: 'image' as const, path: '/tmp/shot-image.png', url: '/tmp/shot-image.png' },
          duration: 5,
          subtitle: '图像分镜',
          hasMissingMedia: false,
        },
        {
          index: 1,
          shot: createShot({ id: 'shot-video', scriptContent: '视频分镜' }),
          media: { type: 'video' as const, path: '/tmp/shot-video.mp4', url: '/tmp/shot-video.mp4', durationSeconds: 4 },
          duration: 4,
          subtitle: '视频分镜',
          hasMissingMedia: false,
        },
        {
          index: 2,
          shot: createShot({ id: 'shot-empty', scriptContent: '空分镜' }),
          media: { type: 'none' as const },
          duration: 6,
          subtitle: '空分镜',
          hasMissingMedia: true,
        },
      ],
      totalDuration: 15,
    };

    const result = buildStoryboardTracks(manifest as any, {
      includeSubtitles: true,
      stillDuration: 3,
    });

    expect(result.exportedShotCount).toBe(2);
    expect(result.duration).toBe(7);
    expect(result.tracks).toHaveLength(2);

    const videoTrack = result.tracks[0];
    const textTrack = result.tracks[1];

    expect(videoTrack.type).toBe('video');
    expect(videoTrack.clips).toHaveLength(2);
    expect(videoTrack.clips[0]).toEqual(expect.objectContaining({
      type: MediaType.IMAGE,
      src: '/tmp/shot-image.png',
      start: 0,
      duration: 3,
      name: 'Shot 1',
    }));
    expect(videoTrack.clips[1]).toEqual(expect.objectContaining({
      type: MediaType.VIDEO,
      src: '/tmp/shot-video.mp4',
      start: 3,
      duration: 4,
      name: 'Shot 2',
    }));

    expect(textTrack.type).toBe('text');
    expect(textTrack.clips).toHaveLength(2);
    expect(textTrack.clips[0]).toEqual(expect.objectContaining({
      text: '图像分镜',
      start: 0,
      duration: 3,
    }));
    expect(textTrack.clips[1]).toEqual(expect.objectContaining({
      text: '视频分镜',
      start: 3,
      duration: 4,
    }));
  });

  it('builds auxiliary audio tracks from current shot versions and aligns subtitle cues', async () => {
    loadShotMetaMock.mockResolvedValueOnce({
      currentVersion: 2,
      versions: [
        { version: 1, media: {} },
        {
          version: 2,
          media: {
            audio: {
              localPath: '/tmp/shot-image-audio.mp3',
              durationMs: 2800,
            },
          },
        },
      ],
    });

    const manifest = {
      shots: [
        {
          index: 0,
          shot: createShot({ id: 'shot-image', scriptContent: '图像分镜' }),
          media: { type: 'image' as const, path: '/tmp/shot-image.png', url: '/tmp/shot-image.png' },
          duration: 5,
          subtitle: '图像分镜',
          hasMissingMedia: false,
        },
        {
          index: 1,
          shot: createShot({ id: 'shot-video', scriptContent: '视频分镜' }),
          media: { type: 'video' as const, path: '/tmp/shot-video.mp4', url: '/tmp/shot-video.mp4', durationSeconds: 4 },
          duration: 4,
          subtitle: '视频分镜',
          hasMissingMedia: false,
        },
      ],
      totalDuration: 9,
    };

    const result = await buildStoryboardAuxiliaryTracks(manifest as any, {
      projectId: 'project-1',
      includeAudio: true,
      includeSubtitles: true,
      stillDuration: 3,
    });

    expect(loadShotMetaMock).toHaveBeenCalledTimes(1);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).toEqual(expect.objectContaining({
      type: 'audio',
      name: 'Storyboard Audio',
    }));
    expect(result.tracks[0].clips[0]).toEqual(expect.objectContaining({
      type: MediaType.AUDIO,
      src: '/tmp/shot-image-audio.mp3',
      start: 0,
      duration: 2.8,
    }));
    expect(result.subtitleCues).toEqual([
      expect.objectContaining({ shotId: 'shot-image', start: 0, end: 3, text: '图像分镜' }),
      expect.objectContaining({ shotId: 'shot-video', start: 3, end: 7, text: '视频分镜' }),
    ]);
  });

  it('renders aligned subtitle cues into srt content', () => {
    const content = buildStoryboardSubtitleContent([
      { index: 1, shotId: 'shot-1', start: 0, end: 3.2, text: '第一句字幕' },
      { index: 2, shotId: 'shot-2', start: 3.2, end: 7.05, text: '第二句字幕' },
    ]);

    expect(content).toContain('00:00:00,000 --> 00:00:03,200');
    expect(content).toContain('00:00:03,200 --> 00:00:07,050');
    expect(content).toContain('第一句字幕');
    expect(content).toContain('第二句字幕');
  });
});
