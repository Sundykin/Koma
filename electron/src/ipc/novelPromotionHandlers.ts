/**
 * Novel Promotion IPC Handlers
 * 处理前端与后端的 Novel Promotion 相关通信
 */

import { ipcMain } from 'electron';
import { ok, fail, type IPCResponseEnvelope } from './contracts';
import { novelPromotionDbService } from '../service/database/novelPromotionDb';
import type {
  StoryToScriptTaskPayload,
  ScriptToStoryboardTaskPayload,
} from '../queue/types';

// ============ Episode Handlers ============

ipcMain.handle('novel-promotion:episode:create', async (_, args: {
  projectId: string;
  name: string;
}): Promise<IPCResponseEnvelope<{ id: string }>> => {
  try {
    const episodeId = `ep_${Date.now()}`;
    novelPromotionDbService.createEpisode({
      id: episodeId,
      projectId: args.projectId,
      name: args.name,
    });

    return ok({ id: episodeId });
  } catch (error) {
    return fail(error, 'EPISODE_CREATE_ERROR');
  }
});

ipcMain.handle('novel-promotion:episode:get', async (_, args: {
  episodeId: string;
}): Promise<IPCResponseEnvelope<any>> => {
  try {
    const episode = novelPromotionDbService.getEpisode(args.episodeId);
    return ok(episode);
  } catch (error) {
    return fail(error, 'EPISODE_GET_ERROR');
  }
});

ipcMain.handle('novel-promotion:episode:list', async (_, args: {
  projectId: string;
}): Promise<IPCResponseEnvelope<any[]>> => {
  try {
    const episodes = novelPromotionDbService.getEpisodesByProject(args.projectId);
    return ok(episodes);
  } catch (error) {
    return fail(error, 'EPISODE_LIST_ERROR');
  }
});

ipcMain.handle('novel-promotion:episode:update', async (_, args: {
  episodeId: string;
  updates: {
    name?: string;
    novelText?: string;
    theme?: string;
    videoRatio?: string;
  };
}): Promise<IPCResponseEnvelope<void>> => {
  try {
    novelPromotionDbService.updateEpisode(args.episodeId, args.updates);
    return ok(undefined);
  } catch (error) {
    return fail(error, 'EPISODE_UPDATE_ERROR');
  }
});

ipcMain.handle('novel-promotion:episode:delete', async (_, args: {
  episodeId: string;
}): Promise<IPCResponseEnvelope<void>> => {
  try {
    novelPromotionDbService.deleteEpisode(args.episodeId);
    return ok(undefined);
  } catch (error) {
    return fail(error, 'EPISODE_DELETE_ERROR');
  }
});

// ============ Character Handlers ============

ipcMain.handle('novel-promotion:character:create', async (_, args: {
  projectId: string;
  name: string;
  description?: string;
  appearance?: string;
  personality?: string;
}): Promise<IPCResponseEnvelope<{ id: string }>> => {
  try {
    const characterId = `char_${Date.now()}`;
    novelPromotionDbService.createCharacter({
      id: characterId,
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      appearance: args.appearance,
      personality: args.personality,
    });

    return ok({ id: characterId });
  } catch (error) {
    return fail(error, 'CHARACTER_CREATE_ERROR');
  }
});

ipcMain.handle('novel-promotion:character:list', async (_, args: {
  projectId: string;
}): Promise<IPCResponseEnvelope<any[]>> => {
  try {
    const characters = novelPromotionDbService.getCharactersByProject(args.projectId);
    return ok(characters);
  } catch (error) {
    return fail(error, 'CHARACTER_LIST_ERROR');
  }
});

ipcMain.handle('novel-promotion:character:update', async (_, args: {
  characterId: string;
  updates: {
    name?: string;
    description?: string;
    appearance?: string;
    personality?: string;
    imageUrl?: string;
  };
}): Promise<IPCResponseEnvelope<void>> => {
  try {
    novelPromotionDbService.updateCharacter(args.characterId, args.updates);
    return ok(undefined);
  } catch (error) {
    return fail(error, 'CHARACTER_UPDATE_ERROR');
  }
});

ipcMain.handle('novel-promotion:character:delete', async (_, args: {
  characterId: string;
}): Promise<IPCResponseEnvelope<void>> => {
  try {
    novelPromotionDbService.deleteCharacter(args.characterId);
    return ok(undefined);
  } catch (error) {
    return fail(error, 'CHARACTER_DELETE_ERROR');
  }
});

// ============ Location Handlers ============

ipcMain.handle('novel-promotion:location:create', async (_, args: {
  projectId: string;
  name: string;
  description?: string;
}): Promise<IPCResponseEnvelope<{ id: string }>> => {
  try {
    const locationId = `loc_${Date.now()}`;
    novelPromotionDbService.createLocation({
      id: locationId,
      projectId: args.projectId,
      name: args.name,
      description: args.description,
    });

    return ok({ id: locationId });
  } catch (error) {
    return fail(error, 'LOCATION_CREATE_ERROR');
  }
});

ipcMain.handle('novel-promotion:location:list', async (_, args: {
  projectId: string;
}): Promise<IPCResponseEnvelope<any[]>> => {
  try {
    const locations = novelPromotionDbService.getLocationsByProject(args.projectId);
    return ok(locations);
  } catch (error) {
    return fail(error, 'LOCATION_LIST_ERROR');
  }
});

ipcMain.handle('novel-promotion:location:update', async (_, args: {
  locationId: string;
  updates: {
    name?: string;
    description?: string;
    imageUrl?: string;
  };
}): Promise<IPCResponseEnvelope<void>> => {
  try {
    novelPromotionDbService.updateLocation(args.locationId, args.updates);
    return ok(undefined);
  } catch (error) {
    return fail(error, 'LOCATION_UPDATE_ERROR');
  }
});

ipcMain.handle('novel-promotion:location:delete', async (_, args: {
  locationId: string;
}): Promise<IPCResponseEnvelope<void>> => {
  try {
    novelPromotionDbService.deleteLocation(args.locationId);
    return ok(undefined);
  } catch (error) {
    return fail(error, 'LOCATION_DELETE_ERROR');
  }
});

// ============ Clip Handlers ============

ipcMain.handle('novel-promotion:clip:list', async (_, args: {
  episodeId: string;
}): Promise<IPCResponseEnvelope<any[]>> => {
  try {
    const clips = novelPromotionDbService.getClipsByEpisode(args.episodeId);
    return ok(clips);
  } catch (error) {
    return fail(error, 'CLIP_LIST_ERROR');
  }
});

// ============ Storyboard Handlers ============

ipcMain.handle('novel-promotion:storyboard:list', async (_, args: {
  episodeId: string;
}): Promise<IPCResponseEnvelope<any[]>> => {
  try {
    const storyboards = novelPromotionDbService.getStoryboardsByEpisode(args.episodeId);
    return ok(storyboards);
  } catch (error) {
    return fail(error, 'STORYBOARD_LIST_ERROR');
  }
});

ipcMain.handle('novel-promotion:panel:update-video', async (_, args: {
  panelId: string;
  videoUrl: string;
  videoStatus: string;
}): Promise<IPCResponseEnvelope<void>> => {
  try {
    novelPromotionDbService.updatePanelVideo(args.panelId, args.videoUrl, args.videoStatus);
    return ok(undefined);
  } catch (error) {
    return fail(error, 'PANEL_UPDATE_VIDEO_ERROR');
  }
});

// ============ Workflow Task Handlers ============

ipcMain.handle('novel-promotion:workflow:story-to-script', async (_, args: StoryToScriptTaskPayload): Promise<IPCResponseEnvelope<{ taskId: string }>> => {
  try {
    // TODO: 提交任务到队列
    const taskId = `task_${Date.now()}`;

    // 这里应该调用队列服务提交任务
    // await queueService.submitTask('story-to-script', args);

    return ok({ taskId });
  } catch (error) {
    return fail(error, 'WORKFLOW_STORY_TO_SCRIPT_ERROR');
  }
});

ipcMain.handle('novel-promotion:workflow:script-to-storyboard', async (_, args: ScriptToStoryboardTaskPayload): Promise<IPCResponseEnvelope<{ taskId: string }>> => {
  try {
    // TODO: 提交任务到队列
    const taskId = `task_${Date.now()}`;

    // 这里应该调用队列服务提交任务
    // await queueService.submitTask('script-to-storyboard', args);

    return ok({ taskId });
  } catch (error) {
    return fail(error, 'WORKFLOW_SCRIPT_TO_STORYBOARD_ERROR');
  }
});

export function registerNovelPromotionHandlers(): void {
  console.log('Novel Promotion IPC handlers registered');
}
