/**
 * Director3D 整体方阵（actor.type === 'formation'）。
 *
 * 与单兵 mannequin-lite 的关键差异：
 *  - **整体单元**：rows × cols 个胶囊小人作为一个组件渲染在 actor.position 周围
 *  - **不可拆分**：拖拽 / 旋转 / 删除整个方阵，方阵内的小人不能单独移动
 *  - **只画"是个人"的最少几何**：每个成员只有"胶囊身体 + 椭球头"，比 Director3DLiteMannequin
 *    更扁平、不带个体光环 / 接地圈，强化"成员是方阵的一部分"语义
 *
 * 方阵接地圈包住整个方阵 footprint，选中时整体高亮。
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DFormationConfig,
} from '../../../types/linghui';
import { resolveDirector3DColor } from './director3dColors';

interface Director3DFormationProps {
  actor: LinghuiDirector3DActor;
  selected?: boolean;
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  onPointerDown?: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => void;
}

// 方阵成员比例（单位米），总高 ≈ 1.4m，比单兵 1.52m 略矮强化"队列"感。
// 结构：头 + 锥形躯干（上宽下窄，肩腰差）+ 两腿；无手臂——
// 144 个士兵每个少 2 个 mesh，方阵整体省 ~290 个 mesh。
const MEMBER_GEOM = {
  headRadius: 0.10,
  torsoTop: 0.16,         // 肩
  torsoBot: 0.12,         // 腰
  torsoHeight: 0.50,
  legRadius: 0.065,
  legLength: 0.70,
  hipWidth: 0.22,
};

interface FormationMember {
  key: string;
  x: number;
  z: number;
  rotationY: number;
}

export function deriveFormationMembers(config: LinghuiDirector3DFormationConfig): FormationMember[] {
  const rows = Math.max(1, Math.min(12, Math.round(config.rows)));
  const cols = Math.max(1, Math.min(12, Math.round(config.cols)));
  const spacing = config.spacing > 0 ? config.spacing : 1;
  const halfColSpan = ((cols - 1) * spacing) / 2;
  const halfRowSpan = ((rows - 1) * spacing) / 2;
  const members: FormationMember[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * spacing - halfColSpan;
      const z = r * spacing - halfRowSpan;
      let rotationY = 0;
      if (config.memberFacing === 'forward') rotationY = 0;
      else if (config.memberFacing === 'away') rotationY = Math.PI;
      else if (config.memberFacing === 'inward') rotationY = Math.atan2(-x, -z);
      else if (config.memberFacing === 'outward') rotationY = Math.atan2(x, z);
      members.push({ key: `${r}-${c}`, x, z, rotationY });
    }
  }
  return members;
}

/** 方阵 footprint 半径（接地光环大小） */
export function deriveFormationFootprint(config: LinghuiDirector3DFormationConfig): number {
  const rows = Math.max(1, Math.min(12, Math.round(config.rows)));
  const cols = Math.max(1, Math.min(12, Math.round(config.cols)));
  const spacing = config.spacing > 0 ? config.spacing : 1;
  const w = (cols - 1) * spacing;
  const d = (rows - 1) * spacing;
  return Math.sqrt(w * w + d * d) / 2 + 0.4;
}

export const Director3DFormation: React.FC<Director3DFormationProps> = ({
  actor,
  selected,
  renderMode = 'preview',
  onPointerDown,
}) => {
  const config = actor.formation;
  // 安全兜底：万一持久化的方阵 actor 没有 formation 字段，给一个最小 1×1 默认值
  const safeConfig = useMemo<LinghuiDirector3DFormationConfig>(
    () => config ?? { rows: 1, cols: 1, spacing: 1, memberFacing: 'forward' },
    [config],
  );

  const color = useMemo(() => {
    if (renderMode === 'silhouette') return resolveDirector3DColor('var(--token-text-primary)', 'black');
    if (renderMode === 'lineart') return resolveDirector3DColor('var(--token-bg-elevated)', 'white');
    return resolveDirector3DColor(actor.color, 'slategray');
  }, [actor.color, renderMode]);

  const haloColor = useMemo(
    () => resolveDirector3DColor(selected ? 'var(--token-text-primary)' : 'var(--token-text-muted)', selected ? 'white' : 'gray'),
    [selected],
  );

  const members = useMemo(() => deriveFormationMembers(safeConfig), [safeConfig]);
  const footprint = useMemo(() => deriveFormationFootprint(safeConfig), [safeConfig]);

  const useStandard = renderMode === 'preview';
  const memberOpacity = renderMode === 'preview' ? 0.78 : 1;

  const bodyMaterial = useStandard ? (
    <meshStandardMaterial color={color} roughness={0.65} metalness={0.05} transparent={memberOpacity < 1} opacity={memberOpacity} />
  ) : (
    <meshBasicMaterial color={color} transparent={memberOpacity < 1} opacity={memberOpacity} side={THREE.DoubleSide} />
  );
  const headMaterial = useStandard ? (
    <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} transparent={memberOpacity < 1} opacity={memberOpacity} />
  ) : (
    <meshBasicMaterial color={color} transparent={memberOpacity < 1} opacity={memberOpacity} side={THREE.DoubleSide} />
  );

  const legTop = MEMBER_GEOM.legLength;
  const torsoCenterY = legTop + MEMBER_GEOM.torsoHeight / 2;
  const shoulderY = legTop + MEMBER_GEOM.torsoHeight - 0.05;
  const headCenterY = shoulderY + MEMBER_GEOM.headRadius + 0.03;
  const hipX = MEMBER_GEOM.hipWidth / 2 - MEMBER_GEOM.legRadius * 0.2;

  return (
    <group
      position={actor.position}
      rotation={[0, actor.rotationY, 0]}
      scale={[actor.scale, actor.scale, actor.scale]}
      onPointerDown={onPointerDown}
    >
      {/* 方阵接地光环（包住整体 footprint） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[footprint - 0.04, footprint, 64]} />
        <meshBasicMaterial color={haloColor} transparent opacity={selected ? 0.85 : 0.35} />
      </mesh>
      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
          <ringGeometry args={[footprint, footprint + 0.06, 64]} />
          <meshBasicMaterial color={haloColor} transparent opacity={0.55} />
        </mesh>
      ) : null}

      {/* 方阵内成员：头 + 锥形躯干 + 两腿，看得出是人但保持低多边 */}
      {members.map((member) => (
        <group
          key={member.key}
          position={[member.x, 0, member.z]}
          rotation={[0, member.rotationY, 0]}
        >
          {/* 躯干：锥形圆柱（肩宽腰窄） */}
          <mesh position={[0, torsoCenterY, 0]}>
            <cylinderGeometry args={[MEMBER_GEOM.torsoTop, MEMBER_GEOM.torsoBot, MEMBER_GEOM.torsoHeight, 12]} />
            {bodyMaterial}
          </mesh>
          {/* 头 */}
          <mesh position={[0, headCenterY, 0]}>
            <sphereGeometry args={[MEMBER_GEOM.headRadius, 14, 10]} />
            {headMaterial}
          </mesh>
          {/* 腿×2 */}
          {([-1, 1] as const).map((sign) => (
            <mesh key={`leg-${sign}`} position={[sign * hipX, legTop / 2, 0]}>
              <cylinderGeometry args={[MEMBER_GEOM.legRadius, MEMBER_GEOM.legRadius, MEMBER_GEOM.legLength, 10]} />
              {bodyMaterial}
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

export default Director3DFormation;
