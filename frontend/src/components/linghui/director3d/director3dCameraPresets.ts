/* ============================================================================
 * 摄影机预设库（C-4）
 *
 * 30+ 镜头预设按 4 类分组，参考 Higgsfield Cinema Studio 的镜头语言抽象：
 *
 *  - 景别 shot-size：根据被摄主体在画面中的占比（ECU/CU/MCU/MS/MLS/LS/ELS）
 *  - 角度 angle：俯仰位置（low / eye / high / bird / pov / worm-eye）
 *  - 焦段 lens：真实焦段，仅改 FOV（24/35/50/85/135mm）
 *  - 经典组合 classic：行业术语镜头（OTS / Dolly / Hero / Establishing / Dutch...）
 *
 * 每个预设的 apply 函数读当前相机参数，返回新参数；
 * 预设之间可叠加（先选景别再选角度再选焦段），所以 apply 必须基于"当前"而非"零点"。
 *
 * preset.english 会写入 directorPromptFragment，让下游 AI 看到具体的镜头术语
 * （比如 "50mm medium close-up over-the-shoulder"），提升出图的镜头语言准确性。
 * ============================================================================ */

import type { LinghuiDirector3DCamera } from '../../../types/linghui';

export type Director3DCameraPresetCategory = 'shot-size' | 'angle' | 'lens' | 'classic';

export interface Director3DCameraPreset {
  id: string;
  category: Director3DCameraPresetCategory;
  label: string;
  english: string;
  hint?: string;
  apply: (camera: LinghuiDirector3DCamera) => LinghuiDirector3DCamera;
}

/** 让相机沿当前视线方向移到指定的"主体距离"，target 不变 */
function moveAlongLineOfSight(camera: LinghuiDirector3DCamera, distance: number): LinghuiDirector3DCamera {
  const dx = camera.position[0] - camera.target[0];
  const dz = camera.position[2] - camera.target[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  // len=0 时默认正前方退一步，避免除零
  const ux = len > 0.001 ? dx / len : 0;
  const uz = len > 0.001 ? dz / len : 1;
  return {
    ...camera,
    position: [
      Number((camera.target[0] + ux * distance).toFixed(3)),
      camera.position[1],
      Number((camera.target[2] + uz * distance).toFixed(3)),
    ],
  };
}

/** 改相机机位高度（眼高），target Y 不变 */
function setEyeHeight(camera: LinghuiDirector3DCamera, eyeY: number): LinghuiDirector3DCamera {
  return {
    ...camera,
    position: [camera.position[0], Number(eyeY.toFixed(3)), camera.position[2]],
  };
}

/** 改取景目标的高度（看高 / 看低），保留 X/Z */
function aimAtHeight(camera: LinghuiDirector3DCamera, targetY: number): LinghuiDirector3DCamera {
  return {
    ...camera,
    target: [camera.target[0], Number(targetY.toFixed(3)), camera.target[2]],
  };
}

/** 改 FOV（同时夹到 18~90 合法范围） */
function setFov(camera: LinghuiDirector3DCamera, fov: number): LinghuiDirector3DCamera {
  return { ...camera, fov: Math.max(18, Math.min(90, Number(fov.toFixed(2)))) };
}

/** 改荷兰角（roll） */
function setRoll(camera: LinghuiDirector3DCamera, roll: number): LinghuiDirector3DCamera {
  return { ...camera, roll: Number(roll.toFixed(2)) };
}

/** OTS 偏移：相机围绕 target 沿垂直视线方向横向偏移 dx 米（正=右，负=左） */
function strafe(camera: LinghuiDirector3DCamera, dx: number): LinghuiDirector3DCamera {
  const fx = camera.target[0] - camera.position[0];
  const fz = camera.target[2] - camera.position[2];
  const len = Math.sqrt(fx * fx + fz * fz);
  if (len < 0.001) return camera;
  // 右向量 = (fz, -fx) / |.|（XZ 平面 90° 顺时针）
  const rx = fz / len;
  const rz = -fx / len;
  return {
    ...camera,
    position: [
      Number((camera.position[0] + rx * dx).toFixed(3)),
      camera.position[1],
      Number((camera.position[2] + rz * dx).toFixed(3)),
    ],
    target: [
      Number((camera.target[0] + rx * dx).toFixed(3)),
      camera.target[1],
      Number((camera.target[2] + rz * dx).toFixed(3)),
    ],
  };
}

export const DIRECTOR3D_CAMERA_PRESETS: Director3DCameraPreset[] = [
  // —— 景别（shot-size） ——
  {
    id: 'shot-size/ecu',
    category: 'shot-size',
    label: '大特写',
    english: 'extreme close-up',
    hint: '主体（眼/手）几乎填满画面，距离 ~0.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.65), 0.5), 38),
  },
  {
    id: 'shot-size/cu',
    category: 'shot-size',
    label: '特写',
    english: 'close-up',
    hint: '脸部主体，距离 ~0.9m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.6), 0.9), 38),
  },
  {
    id: 'shot-size/mcu',
    category: 'shot-size',
    label: '中近景',
    english: 'medium close-up',
    hint: '胸上半身，距离 ~1.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.5), 1.5), 36),
  },
  {
    id: 'shot-size/ms',
    category: 'shot-size',
    label: '中景',
    english: 'medium shot',
    hint: '腰上半身，距离 ~2.2m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.4), 2.2), 35),
  },
  {
    id: 'shot-size/mls',
    category: 'shot-size',
    label: '中远景',
    english: 'medium long shot',
    hint: '膝上半身，距离 ~3.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.2), 3.5), 38),
  },
  {
    id: 'shot-size/ls',
    category: 'shot-size',
    label: '远景',
    english: 'long shot',
    hint: '全身入画，距离 ~5.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.0), 5.5), 42),
  },
  {
    id: 'shot-size/els',
    category: 'shot-size',
    label: '大远景',
    english: 'extreme long shot',
    hint: '主体小，环境为主，距离 ~9m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 0.8), 9.0), 48),
  },
  {
    id: 'shot-size/cowboy',
    category: 'shot-size',
    label: '牛仔镜',
    english: 'cowboy shot, knee-up framing',
    hint: '膝盖以上入画，西部片招牌，距离 ~3.0m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.3), 3.0), 36),
  },

  // —— 角度（angle） ——
  {
    id: 'angle/worm-eye',
    category: 'angle',
    label: '虫眼',
    english: 'worm-eye shot, ground-level low angle',
    hint: '近地面仰拍 ~0.2m，戏剧化高大感',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.5), 0.2),
  },
  {
    id: 'angle/low',
    category: 'angle',
    label: '低角度仰拍',
    english: 'low-angle shot',
    hint: '机位高度 ~0.6m，强势 / 英雄感',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.6), 0.6),
  },
  {
    id: 'angle/eye-level',
    category: 'angle',
    label: '平视',
    english: 'eye-level shot',
    hint: '机位与角色眼平齐 ~1.55m，中立',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.55), 1.55),
  },
  {
    id: 'angle/high',
    category: 'angle',
    label: '高角度俯拍',
    english: 'high-angle shot',
    hint: '机位 ~2.5m，弱势 / 全局感',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.2), 2.5),
  },
  {
    id: 'angle/bird-eye',
    category: 'angle',
    label: '鸟瞰',
    english: 'birds-eye view, top-down shot',
    hint: '机位 ~7m，俯视全场',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(cam, 0.0), 7.0), 50),
  },
  {
    id: 'angle/dutch',
    category: 'angle',
    label: '荷兰角',
    english: 'dutch tilt, canted angle',
    hint: '相机 roll 8° 倾斜，紧张 / 失衡',
    apply: (cam) => setRoll(cam, 8),
  },

  // —— 焦段（lens，仅改 FOV） ——
  {
    id: 'lens/24mm',
    category: 'lens',
    label: '24mm 超广角',
    english: '24mm ultra-wide lens',
    hint: '广角畸变 / 沉浸感（FOV ~73°）',
    apply: (cam) => setFov(cam, 73),
  },
  {
    id: 'lens/35mm',
    category: 'lens',
    label: '35mm 标准广角',
    english: '35mm standard wide lens',
    hint: '记录感 / 自然透视（FOV ~54°）',
    apply: (cam) => setFov(cam, 54),
  },
  {
    id: 'lens/50mm',
    category: 'lens',
    label: '50mm 标准',
    english: '50mm standard prime lens',
    hint: '接近人眼透视（FOV ~40°）',
    apply: (cam) => setFov(cam, 40),
  },
  {
    id: 'lens/85mm',
    category: 'lens',
    label: '85mm 中长焦',
    english: '85mm portrait lens',
    hint: '人像头像 / 背景虚化（FOV ~24°）',
    apply: (cam) => setFov(cam, 24),
  },
  {
    id: 'lens/135mm',
    category: 'lens',
    label: '135mm 长焦',
    english: '135mm telephoto lens',
    hint: '强空间压缩 / 远景特写（FOV ~18°）',
    apply: (cam) => setFov(cam, 18),
  },

  // —— 经典镜头（classic combinations） ——
  {
    id: 'classic/ots-left',
    category: 'classic',
    label: '过肩 OTS · 左',
    english: 'over-the-shoulder shot from left side',
    hint: '相机向左偏 0.6m，常用于对切',
    apply: (cam) => setFov(strafe(moveAlongLineOfSight(aimAtHeight(cam, 1.55), 1.6), -0.6), 36),
  },
  {
    id: 'classic/ots-right',
    category: 'classic',
    label: '过肩 OTS · 右',
    english: 'over-the-shoulder shot from right side',
    hint: '相机向右偏 0.6m，常用于对切',
    apply: (cam) => setFov(strafe(moveAlongLineOfSight(aimAtHeight(cam, 1.55), 1.6), 0.6), 36),
  },
  {
    id: 'classic/dolly-in',
    category: 'classic',
    label: '推近 Dolly In',
    english: 'dolly-in push, camera moves closer',
    hint: '当前距离 × 0.7',
    apply: (cam) => {
      const dx = cam.position[0] - cam.target[0];
      const dz = cam.position[2] - cam.target[2];
      const current = Math.sqrt(dx * dx + dz * dz);
      return moveAlongLineOfSight(cam, Math.max(0.6, current * 0.7));
    },
  },
  {
    id: 'classic/pull-back',
    category: 'classic',
    label: '拉远 Pull Back',
    english: 'pull-back reveal, camera retreats',
    hint: '当前距离 × 1.6',
    apply: (cam) => {
      const dx = cam.position[0] - cam.target[0];
      const dz = cam.position[2] - cam.target[2];
      const current = Math.sqrt(dx * dx + dz * dz);
      return moveAlongLineOfSight(cam, Math.min(20, current * 1.6));
    },
  },
  {
    id: 'classic/hero-low',
    category: 'classic',
    label: '英雄低镜',
    english: 'hero low-angle shot, wide lens upward tilt',
    hint: '0.5m 仰拍 + 24mm 广角',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 1.8), 1.7), 0.5), 60),
  },
  {
    id: 'classic/establishing',
    category: 'classic',
    label: '建立镜',
    english: 'establishing wide shot, master shot of the scene',
    hint: '远景 + 高机位 + 50mm，开场标配',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 9.0), 1.0), 4.0), 50),
  },
  {
    id: 'classic/2-shot',
    category: 'classic',
    label: '双人对话 2-Shot',
    english: 'two-shot framing two characters side by side',
    hint: '中景双人入画 ~3.5m，35mm',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 3.5), 1.4), 1.55), 50),
  },
  {
    id: 'classic/trailing',
    category: 'classic',
    label: '背身跟拍',
    english: 'trailing shot from behind the subject',
    hint: '镜头紧贴背后 ~1.4m',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 1.4), 1.5), 1.45), 40),
  },
  {
    id: 'classic/profile',
    category: 'classic',
    label: '侧面横移',
    english: 'profile / dolly side tracking shot',
    hint: '与角色平行的侧面镜头',
    apply: (cam) => setFov(strafe(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 2.0), 1.5), 1.5), 1.5), 35),
  },
  {
    id: 'classic/insert',
    category: 'classic',
    label: '插入镜',
    english: 'insert shot, tight detail close-up of an object',
    hint: '极近特写小物 / 道具，距离 ~0.4m',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 0.4), 1.0), 1.2), 32),
  },
  {
    id: 'classic/master',
    category: 'classic',
    label: '主镜 Master',
    english: 'master shot, full-coverage wide angle establishing the scene geometry',
    hint: '全场覆盖远景 + 35mm 标准广角',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 7.0), 1.2), 1.75), 54),
  },
  {
    id: 'classic/reaction',
    category: 'classic',
    label: '反应镜',
    english: 'reaction shot, tight close-up showing the listener',
    hint: '对话反打 + 中近景 + 长焦微压缩',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 1.4), 1.55), 1.55), 32),
  },
];

/** 按 category 分组 */
export function groupDirector3DCameraPresets(): Record<Director3DCameraPresetCategory, Director3DCameraPreset[]> {
  return DIRECTOR3D_CAMERA_PRESETS.reduce((acc, preset) => {
    acc[preset.category] = acc[preset.category] || [];
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<Director3DCameraPresetCategory, Director3DCameraPreset[]>);
}

export const DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS: Record<Director3DCameraPresetCategory, string> = {
  'shot-size': '景别',
  angle: '角度',
  lens: '焦段',
  classic: '经典镜头',
};
