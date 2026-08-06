/**
 * 演员库条目：跨项目复用的"演员"档案。
 * 存的是角色设定 + 定妆照 + 绑定音色，选入项目时会复制一份成为项目内角色。
 */
import type { CharacterGender } from '../types';

export interface ActorProfile {
  id: string;
  name: string;
  gender?: CharacterGender;
  age?: string;
  /** 视觉提示词（外貌/服装/体态等客观可见设定） */
  prompt: string;
  /** 戏路/备注 */
  note?: string;
  /** 绑定音色（VoiceProfile.id） */
  voiceId?: string;
  /** 定妆照：库内文件绝对路径 */
  costumePhotoPath?: string;
  /** 定妆照远端 URL（已上传图床时有） */
  costumePhotoRemoteUrl?: string;
  createdAt: number;
  updatedAt: number;
}
