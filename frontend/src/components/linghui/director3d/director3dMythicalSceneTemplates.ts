import {
  createDirector3DActor,
  createDirector3DCreature,
} from './director3dAssetLibrary';
import { defaultDirector3DBackground } from './director3dDefaults';
import {
  ACTOR_DEFAULT_COLORS,
  templateActor,
  type Director3DSceneTemplate,
} from './director3dSceneTemplateHelpers';

export const DIRECTOR3D_MYTHICAL_SCENE_TEMPLATES: Director3DSceneTemplate[] = [
  {
    id: 'tpl-sword-duel',
    label: '剑修对峙',
    hint: '两位剑修隔山涧对峙，长剑指地，灵狐侧立',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.4, 5.5],
        target: [0, 1.5, 0],
        fov: 38,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '剑修甲', [-1.6, 0, 0], Math.PI / 2.2, 'point'),
        templateActor(1, '剑修乙', [1.6, 0, 0], -Math.PI / 2.2, 'point'),
        createDirector3DCreature('fox', {
          id: 'tpl_sword_fox',
          position: [-1.6, 0, 0.8],
          scale: 0.6,
          creatureAction: 'idle',
        }),
        createDirector3DActor({ id: 'tpl_sword_pillar_l', type: 'prop-cylinder', label: '石柱', position: [-2.6, 0, -0.6], rotationY: 0, scale: 2.2, color: 'var(--token-text-muted)' }),
        createDirector3DActor({ id: 'tpl_sword_pillar_r', type: 'prop-cylinder', label: '石柱', position: [2.6, 0, -0.6], rotationY: 0, scale: 2.2, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-altar',
    label: '祭祀法坛',
    hint: '圆台居中，主祭手举法器，仙鹤盘旋',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 2.2, 5.5],
        target: [0, 1.0, 0],
        fov: 42,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '主祭', [0, 0, 0], 0, 'wave'),
        createDirector3DCreature('crane', {
          id: 'tpl_altar_crane',
          position: [-1.4, 1.8, 0.6],
          scale: 0.9,
          creatureAction: 'fly',
        }),
        createDirector3DActor({ id: 'tpl_altar_dais', type: 'prop-cylinder', label: '法坛圆台', position: [0, 0, 0], rotationY: 0, scale: 1.6, color: 'var(--token-text-muted)' }),
        createDirector3DActor({ id: 'tpl_altar_pillar_1', type: 'prop-cylinder', label: '香烛', position: [-1.0, 0, 0.8], rotationY: 0, scale: 0.6, color: 'var(--token-status-warning)' }),
        createDirector3DActor({ id: 'tpl_altar_pillar_2', type: 'prop-cylinder', label: '香烛', position: [1.0, 0, 0.8], rotationY: 0, scale: 0.6, color: 'var(--token-status-warning)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-dragon-confront',
    label: '神龙降世',
    hint: '主角立于山巅，神龙盘旋俯视',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [3.0, 2.5, 6.5],
        target: [0, 2.0, 0],
        fov: 46,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '主角', [0, 0, 0], -Math.PI / 6, 'point'),
        createDirector3DCreature('dragon', {
          id: 'tpl_dragon_main',
          position: [0, 2.8, -2.0],
          rotationY: Math.PI / 4,
          scale: 1.1,
          creatureAction: 'fly',
        }),
        createDirector3DActor({ id: 'tpl_dragon_peak', type: 'prop-cylinder', label: '山巅岩', position: [0, 0, 0], rotationY: 0, scale: 1.8, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-phoenix-rebirth',
    label: '凤凰涅槃',
    hint: '凤凰展翅升空，下方仰望者',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 0.6, 5.5],
        target: [0, 2.5, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '9:16',
      },
      actors: [
        templateActor(0, '仰望者', [0, 0, 0], 0, 'idle'),
        createDirector3DCreature('phoenix', {
          id: 'tpl_phoenix_main',
          position: [0, 3.2, -0.4],
          rotationY: 0,
          scale: 1.0,
          creatureAction: 'fly',
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-cloud-summit',
    label: '云海仙境',
    hint: '仙鹤盘旋云上，仙人对坐论道',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 2.0, 6.0],
        target: [0, 1.6, 0],
        fov: 44,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '仙人甲', [-1.2, 0, 0], Math.PI / 2, 'sit'),
        templateActor(1, '仙人乙', [1.2, 0, 0], -Math.PI / 2, 'sit'),
        createDirector3DCreature('crane', {
          id: 'tpl_cloud_crane_l',
          position: [-2.5, 2.0, -1.0],
          scale: 0.85,
          creatureAction: 'fly',
        }),
        createDirector3DCreature('crane', {
          id: 'tpl_cloud_crane_r',
          position: [2.5, 2.4, -1.2],
          scale: 0.85,
          creatureAction: 'fly',
        }),
        createDirector3DActor({ id: 'tpl_cloud_plinth', type: 'prop-cylinder', label: '云台', position: [0, 0, 0], rotationY: 0, scale: 1.4, color: 'var(--token-bg-elevated)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-mythical-battlefield',
    label: '玄幻战场',
    hint: '麒麟坐镇，士兵方阵冲锋',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 2.8, 7.5],
        target: [0, 1.0, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        createDirector3DCreature('qilin', {
          id: 'tpl_battle_qilin',
          position: [0, 0, -2.0],
          rotationY: 0,
          scale: 1.2,
          creatureAction: 'roar',
        }),
        createDirector3DActor({
          id: 'tpl_battle_army',
          type: 'formation',
          label: '将士',
          position: [0, 0, 2.5],
          rotationY: Math.PI,
          scale: 0.95,
          color: ACTOR_DEFAULT_COLORS[3],
          posePreset: 'idle',
          formation: { rows: 4, cols: 8, spacing: 0.85, memberFacing: 'forward' },
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
];
