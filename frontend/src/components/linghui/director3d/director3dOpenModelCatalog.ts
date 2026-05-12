import type {
  LinghuiDirector3DActorPose,
} from '../../../types/linghui';

export type Director3DOpenModelLicense =
  | 'CC0-1.0'
  | 'MIT'
  | 'per-asset-license';

export type Director3DOpenModelKind =
  | 'character-pack'
  | 'humanoid-generator'
  | 'prop-library'
  | 'gltf-rig-reference'
  | 'skeleton-drawing-reference';

export interface Director3DOpenModelCatalogEntry {
  id: string;
  label: string;
  kind: Director3DOpenModelKind;
  sourceName: string;
  sourceUrl: string;
  license: Director3DOpenModelLicense;
  licenseUrl: string;
  usage: string;
  rigNotes: string;
  importStatus: 'procedural-ready' | 'reference-only';
  actorDefaults?: {
    label: string;
    color: string;
    scale: number;
    posePreset: LinghuiDirector3DActorPose;
  };
}

const HASH = String.fromCharCode(35);

export const DIRECTOR3D_OPEN_MODEL_CATALOG: Director3DOpenModelCatalogEntry[] = [
  {
    id: 'kenney-blocky-characters',
    label: 'Blocky Characters',
    kind: 'character-pack',
    sourceName: 'Kenney',
    sourceUrl: 'https://kenney.nl/assets/blocky-characters',
    license: 'CC0-1.0',
    licenseUrl: 'https://kenney.nl/license',
    usage: '低多边角色包，适合导演工作台的群演、主角基础比例和游戏式 blocking 参考。',
    rigNotes: '方块化头身比例清晰，适合用程序化骨骼层级复刻正面、背面、手脚和朝向标记。',
    importStatus: 'procedural-ready',
    actorDefaults: {
      label: 'Kenney 低多边主角',
      color: `${HASH}4f8cc9`,
      scale: 1,
      posePreset: 'idle',
    },
  },
  {
    id: 'makehuman-humanoid-export',
    label: 'MakeHuman Humanoid',
    kind: 'humanoid-generator',
    sourceName: 'MakeHuman',
    sourceUrl: 'http://www.makehumancommunity.org/',
    license: 'CC0-1.0',
    licenseUrl: 'http://www.makehumancommunity.org/content/license.html',
    usage: '写实人体比例、脸部、服装和骨骼绑定参考；后续可导入本地导出的 CC0 角色。',
    rigNotes: '适合参考标准人形骨架：spine / neck / shoulder / elbow / hip / knee 分层和左右肢体对称命名。',
    importStatus: 'procedural-ready',
    actorDefaults: {
      label: '写实人形主角',
      color: `${HASH}d97757`,
      scale: 1.02,
      posePreset: 'idle',
    },
  },
  {
    id: 'polyhaven-cc0-models',
    label: 'Poly Haven Models',
    kind: 'prop-library',
    sourceName: 'Poly Haven',
    sourceUrl: 'https://polyhaven.com/models',
    license: 'CC0-1.0',
    licenseUrl: 'https://polyhaven.com/license',
    usage: 'CC0 场景道具、环境物件、材质参考，适合后续补充真实道具 GLB/纹理资产。',
    rigNotes: '多数为静态模型，不作为角色骨骼来源；适合补齐桌椅、岩石、车辆、环境陈设。',
    importStatus: 'reference-only',
  },
  {
    id: 'khronos-gltf-sample-assets-rigs',
    label: 'glTF Rig Samples',
    kind: 'gltf-rig-reference',
    sourceName: 'Khronos glTF Sample Assets',
    sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
    license: 'per-asset-license',
    licenseUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models',
    usage: 'glTF / GLB 文件结构、SkinnedMesh、动画通道、关节层级的格式参考。',
    rigNotes: 'CesiumMan、RiggedSimple 等样例适合研究骨骼动画导入，但必须逐模型核对 license 后再打包。',
    importStatus: 'reference-only',
  },
  {
    id: 'threejs-skeleton-helper',
    label: 'SkeletonHelper',
    kind: 'skeleton-drawing-reference',
    sourceName: 'Three.js',
    sourceUrl: 'https://threejs.org/docs/#api/en/helpers/SkeletonHelper',
    license: 'MIT',
    licenseUrl: 'https://github.com/mrdoob/three.js/blob/dev/LICENSE',
    usage: '骨骼线框可视化画法参考，适合在工作台中展示关节连接、姿态调试和 rig debug。',
    rigNotes: '骨骼 helper 通常以骨节点连线表达父子层级；本工作台当前用 group 层级和关节球表达同类信息。',
    importStatus: 'reference-only',
  },
];

export function getDirector3DProceduralModelEntries(): Director3DOpenModelCatalogEntry[] {
  return DIRECTOR3D_OPEN_MODEL_CATALOG.filter(entry => entry.importStatus === 'procedural-ready' && entry.actorDefaults);
}

