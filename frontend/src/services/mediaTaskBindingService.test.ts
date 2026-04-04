import { beforeEach, describe, expect, it, vi } from 'vitest';

const existsMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const loadEpisodeShotsMock = vi.fn();
const saveEpisodeShotsMock = vi.fn();
const loadShotsMock = vi.fn();
const saveShotsMock = vi.fn();

vi.mock('../services/electronService', () => ({
  electronService: {
    isElectron: vi.fn(() => true),
    fs: {
      exists: (path: string) => existsMock(path),
      readFile: (path: string) => readFileMock(path),
      writeFile: (path: string, data: string) => writeFileMock(path, data),
    },
  },
}));

vi.mock('../store/project/core', () => ({
  getProjectPath: vi.fn(async () => '/project'),
}));

vi.mock('../store/projectStore', () => ({
  loadCharacters: vi.fn(),
  saveCharacters: vi.fn(),
  loadScenes: vi.fn(),
  saveScenes: vi.fn(),
  loadProps: vi.fn(),
  saveProps: vi.fn(),
  loadEpisodeShots: (...args: any[]) => loadEpisodeShotsMock(...args),
  saveEpisodeShots: (...args: any[]) => saveEpisodeShotsMock(...args),
  loadShots: (...args: any[]) => loadShotsMock(...args),
  saveShots: (...args: any[]) => saveShotsMock(...args),
}));

import { bindOwnerRefMedia } from './mediaTaskBindingService';

function createShot(id: string) {
  return {
    id,
    scriptContent: '镜头内容',
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 4,
    characters: [],
    scenes: [],
    props: [],
    media: {},
  } as any;
}

describe('mediaTaskBindingService', () => {
  beforeEach(() => {
    existsMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    loadEpisodeShotsMock.mockReset();
    saveEpisodeShotsMock.mockReset();
    loadShotsMock.mockReset();
    saveShotsMock.mockReset();
  });

  it('syncs shot-version video assets back into episode shot media', async () => {
    existsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(JSON.stringify({
      id: 'shot-1',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          media: {},
          createdAt: 1,
        },
      ],
    }));
    loadEpisodeShotsMock.mockResolvedValue([createShot('shot-1')]);
    saveEpisodeShotsMock.mockResolvedValue(undefined);

    const asset = {
      kind: 'video',
      localPath: '/tmp/generated.mp4',
      remoteUrl: 'https://cdn.example.com/generated.mp4',
      createdAt: 1,
    } as any;

    await bindOwnerRefMedia('project-1', {
      projectId: 'project-1',
      ownerType: 'shot-version',
      ownerId: 'shot-1',
      slot: 'video',
      versionId: 'v1',
      episodeId: 'episode-1',
    }, asset);

    expect(writeFileMock).toHaveBeenCalledWith(
      '/project/shots/shot-1/shot.json',
      expect.stringContaining('"video"'),
    );
    expect(saveEpisodeShotsMock).toHaveBeenCalledWith(
      'project-1',
      'episode-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'shot-1',
          media: expect.objectContaining({
            videos: [asset],
            currentVideoIndex: 0,
          }),
        }),
      ]),
    );
  });

  it('serializes concurrent shot media writes to avoid overwriting sibling video results', async () => {
    let storedShots = [createShot('shot-1'), createShot('shot-2')];
    loadEpisodeShotsMock.mockImplementation(async () => JSON.parse(JSON.stringify(storedShots)));

    let releaseFirstSave: (() => void) | null = null;
    const firstSaveGate = new Promise<void>(resolve => {
      releaseFirstSave = resolve;
    });

    let saveCount = 0;
    saveEpisodeShotsMock.mockImplementation(async (_projectId: string, _episodeId: string, shots: any[]) => {
      saveCount += 1;
      if (saveCount === 1) {
        await firstSaveGate;
      }
      storedShots = JSON.parse(JSON.stringify(shots));
    });

    const assetA = {
      kind: 'video',
      localPath: '/tmp/a.mp4',
      createdAt: 1,
    } as any;
    const assetB = {
      kind: 'video',
      localPath: '/tmp/b.mp4',
      createdAt: 2,
    } as any;

    const first = bindOwnerRefMedia('project-1', {
      projectId: 'project-1',
      ownerType: 'shot',
      ownerId: 'shot-1',
      slot: 'video',
      episodeId: 'episode-1',
    }, assetA);
    const second = bindOwnerRefMedia('project-1', {
      projectId: 'project-1',
      ownerType: 'shot',
      ownerId: 'shot-2',
      slot: 'video',
      episodeId: 'episode-1',
    }, assetB);

    await Promise.resolve();
    await Promise.resolve();

    expect(loadEpisodeShotsMock).toHaveBeenCalledTimes(1);

    releaseFirstSave?.();
    await Promise.all([first, second]);

    expect(storedShots.find(shot => shot.id === 'shot-1')?.media?.videos).toEqual([assetA]);
    expect(storedShots.find(shot => shot.id === 'shot-2')?.media?.videos).toEqual([assetB]);
  });
});
