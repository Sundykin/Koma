import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsExistsMock = vi.fn();
const fsReadFileMock = vi.fn();
const getProjectPathMock = vi.fn();

vi.mock('../../services/electronService', () => ({
  electronService: {
    isElectron: vi.fn(() => true),
    fs: {
      exists: (...args: unknown[]) => fsExistsMock(...args),
      readFile: (...args: unknown[]) => fsReadFileMock(...args),
      writeFile: vi.fn(),
    },
  },
}));

vi.mock('./core', () => ({
  getProjectPath: (...args: unknown[]) => getProjectPathMock(...args),
}));

vi.mock('./mediaUrlRemap', () => ({
  remapTimelineClipSourcesToLocal: vi.fn(async (_projectPath: string, timeline: unknown) => ({ timeline })),
}));

describe('loadTimeline future-version boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    fsExistsMock.mockReset();
    fsReadFileMock.mockReset();
    getProjectPathMock.mockReset();
  });

  it('rethrows unsupported future timeline versions instead of swallowing them as null', async () => {
    fsExistsMock.mockResolvedValue(true);
    fsReadFileMock.mockResolvedValue(JSON.stringify({ version: 99, tracks: [] }));
    getProjectPathMock.mockResolvedValue('/tmp/project-1');

    const { loadTimeline } = await import('./timeline');

    await expect(loadTimeline('project-1')).rejects.toThrow('Unsupported timeline version: 99');
  });

  it('still returns null for non-version-related read failures', async () => {
    fsExistsMock.mockResolvedValue(true);
    fsReadFileMock.mockRejectedValue(new Error('IO failed'));
    getProjectPathMock.mockResolvedValue('/tmp/project-1');

    const { loadTimeline } = await import('./timeline');

    await expect(loadTimeline('project-1')).resolves.toBeNull();
  });
});
