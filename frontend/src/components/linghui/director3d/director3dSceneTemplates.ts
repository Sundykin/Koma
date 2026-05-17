import { createDirector3DActor } from './director3dAssetLibrary';
import { defaultDirector3DBackground } from './director3dDefaults';
import { DIRECTOR3D_MYTHICAL_SCENE_TEMPLATES } from './director3dMythicalSceneTemplates';
import {
  ACTOR_DEFAULT_COLORS,
  templateActor,
  type Director3DSceneTemplate,
} from './director3dSceneTemplateHelpers';
export {
  DIRECTOR3D_ORBIT_9_DEGREES,
  DIRECTOR3D_THREE_VIEW_DEGREES,
  buildOrbitCameras,
  buildTopDownCamera,
  type Director3DSceneTemplate,
} from './director3dSceneTemplateHelpers';

const DIRECTOR3D_BASE_SCENE_TEMPLATES: Director3DSceneTemplate[] = [
  {
    id: 'tpl-dialogue',
    label: '双人对话',
    hint: '两位角色面对面，平视 OTS 取景，间距 1.4m',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [2.4, 1.55, 2.4],
        target: [0, 1.55, 0],
        fov: 36,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '角色A', [-0.7, 0, 0], Math.PI / 2),
        templateActor(1, '角色B', [0.7, 0, 0], -Math.PI / 2),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-monologue',
    label: '独白特写',
    hint: '单一角色面向相机，胸上景特写，平视',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.55, 2.2],
        target: [0, 1.55, 0],
        fov: 32,
        roll: 0,
        aspectRatio: '4:3',
      },
      actors: [
        templateActor(0, '主角', [0, 0, 0], 0),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-triangle',
    label: '三角构图',
    hint: '三人三角站位，前一后二，广角 50mm 等效',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.55, 4.5],
        target: [0, 1.4, 0],
        fov: 42,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '前景角色', [0, 0, 0.8], 0),
        templateActor(1, '左后角色', [-1.0, 0, -0.6], Math.PI / 6),
        templateActor(2, '右后角色', [1.0, 0, -0.6], -Math.PI / 6),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-ots',
    label: '过肩 OTS',
    hint: '从一位角色的肩后取景另一位角色，常用反应镜头',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [-1.4, 1.7, 1.6],
        target: [0.6, 1.55, 0],
        fov: 36,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '前景肩部', [-0.5, 0, 0.4], Math.PI / 2.5),
        templateActor(1, '被拍主角', [0.6, 0, -0.2], -Math.PI / 2.5),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-ensemble',
    label: '群戏排布',
    hint: '五人扇形展开，远景大全景',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.65, 6.5],
        target: [0, 1.4, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '中心角色', [0, 0, 0], 0),
        templateActor(1, '左近', [-1.1, 0, 0.25], Math.PI / 8),
        templateActor(2, '右近', [1.1, 0, 0.25], -Math.PI / 8),
        templateActor(3, '左远', [-2.0, 0, -0.4], Math.PI / 6),
        templateActor(4, '右远', [2.0, 0, -0.4], -Math.PI / 6),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-courtroom',
    label: '法庭审判',
    hint: '法官居中俯视，原告 / 被告两侧分坐',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.8, 5.5],
        target: [0, 1.3, 0],
        fov: 42,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '法官', [0, 0, -1.6], 0, 'sit'),
        templateActor(1, '原告', [-1.6, 0, 0.6], Math.PI / 4),
        templateActor(2, '被告', [1.6, 0, 0.6], -Math.PI / 4),
        createDirector3DActor({ id: 'tpl_courtroom_bench', type: 'prop-box', label: '法官席', position: [0, 0, -1.9], rotationY: 0, scale: 1.5, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-stage',
    label: '舞台演讲',
    hint: '主角站台前，前方扇形观众群演',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.7, 7],
        target: [0, 1.4, 0],
        fov: 48,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '演讲者', [0, 0, -0.8], 0, 'point'),
        createDirector3DActor({
          id: 'tpl_stage_audience',
          type: 'formation',
          label: '观众席',
          position: [0, 0, 2.4],
          rotationY: Math.PI,
          scale: 0.9,
          color: ACTOR_DEFAULT_COLORS[0],
          posePreset: 'idle',
          formation: { rows: 3, cols: 6, spacing: 0.9, memberFacing: 'forward' },
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-restaurant',
    label: '餐厅对坐',
    hint: '两人桌前对坐，长桌居中',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [-1.8, 1.6, 2.6],
        target: [0, 1.2, 0],
        fov: 36,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '主角', [-0.7, 0, -0.6], Math.PI / 2, 'sit'),
        templateActor(1, '同伴', [0.7, 0, -0.6], -Math.PI / 2, 'sit'),
        createDirector3DActor({ id: 'tpl_restaurant_table', type: 'prop-box', label: '长桌', position: [0, 0, -0.6], rotationY: 0, scale: 1.3, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-car-interior',
    label: '车内对话',
    hint: '驾驶座 + 副驾，狭窄空间侧面捕捉',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [-2.4, 1.4, 0.4],
        target: [0, 1.2, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '司机', [-0.45, 0, 0], 0, 'sit'),
        templateActor(1, '乘客', [0.45, 0, 0], 0, 'sit'),
        createDirector3DActor({ id: 'tpl_car_box', type: 'prop-box', label: '车厢', position: [0, 0, 0], rotationY: 0, scale: 1.8, color: 'var(--token-status-info)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-confrontation',
    label: '紧张对峙',
    hint: '两人对峙，相距 ~2.2m，低角度拉紧',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 0.7, 3.4],
        target: [0, 1.5, 0],
        fov: 38,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '主角', [-1.1, 0, 0], Math.PI / 2, 'idle'),
        templateActor(1, '对手', [1.1, 0, 0], -Math.PI / 2, 'idle'),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-alley',
    label: '街角伏击',
    hint: '一人靠墙，另一人从街角拐入',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [2.6, 1.4, 2.0],
        target: [0, 1.4, 0],
        fov: 38,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '靠墙者', [-0.8, 0, 0], Math.PI / 6, 'idle'),
        templateActor(1, '突进者', [1.4, 0, -1.2], -Math.PI / 3, 'run'),
        createDirector3DActor({ id: 'tpl_alley_wall', type: 'prop-plane', label: '街墙', position: [-1.4, 0, 0], rotationY: Math.PI / 2, scale: 1.6, color: 'var(--token-border-strong)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-classroom',
    label: '教室授课',
    hint: '老师面向学生方阵',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.7, 6],
        target: [0, 1.3, 0],
        fov: 45,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '老师', [0, 0, -1.5], 0, 'point'),
        createDirector3DActor({
          id: 'tpl_classroom_students',
          type: 'formation',
          label: '学生',
          position: [0, 0, 1.6],
          rotationY: Math.PI,
          scale: 0.85,
          color: ACTOR_DEFAULT_COLORS[2],
          posePreset: 'sit',
          formation: { rows: 3, cols: 5, spacing: 1.0, memberFacing: 'forward' },
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
];

export const DIRECTOR3D_SCENE_TEMPLATES: Director3DSceneTemplate[] = [
  ...DIRECTOR3D_BASE_SCENE_TEMPLATES,
  ...DIRECTOR3D_MYTHICAL_SCENE_TEMPLATES,
];
