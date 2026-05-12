/**
 * Director3D 低级群演假人（mannequin-lite）。
 *
 * 目标：用最少几何让用户一眼看出"是个人"，但渲染开销远低于主角 mannequin。
 * 形态：头 + 锥形躯干（上宽下窄，肩膀感）+ 两短臂 + 两条腿 = 6 个简单几何。
 * 不参与姿势预设（posePreset 字段被忽略）。
 *
 * 与 Director3DFormation 内成员的差异：
 *  - 单兵有手臂，更立体
 *  - 单兵有独立的接地圈和选中光环（可单独拖拽，方阵成员不行）
 *  - 单兵几何略大一些（强化"路人甲"质感而非"队列里的兵"）
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { LinghuiDirector3DActor } from '../../../types/linghui';
import { resolveDirector3DColor } from './director3dColors';

interface Director3DLiteMannequinProps {
  actor: LinghuiDirector3DActor;
  selected?: boolean;
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  onPointerDown?: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => void;
}

// 单兵比例（单位米），总高 ≈ 1.52m，比主角 1.75m 略矮强化"群演"感
const LITE_PROPS = {
  headRadius: 0.11,
  shoulderWidth: 0.36,    // 躯干顶部宽度（肩宽）
  hipWidth: 0.26,         // 躯干底部宽度（腰宽，比肩窄）
  torsoTop: 0.18,         // = shoulderWidth / 2
  torsoBot: 0.13,         // = hipWidth / 2
  torsoHeight: 0.55,
  armRadius: 0.045,
  armLength: 0.5,
  legRadius: 0.07,
  legLength: 0.75,
};

const HASH = String.fromCharCode(35);
const LITE_DETAIL_COLORS = {
  face: `${HASH}15171c`,
  chest: `${HASH}2d6cdf`,
  back: `${HASH}6b7280`,
  shoe: `${HASH}111318`,
};

export const Director3DLiteMannequin: React.FC<Director3DLiteMannequinProps> = ({
  actor,
  selected,
  renderMode = 'preview',
  onPointerDown,
}) => {
  const color = useMemo(() => {
    if (renderMode === 'silhouette') return resolveDirector3DColor('var(--token-text-primary)', 'black');
    if (renderMode === 'lineart') return resolveDirector3DColor('var(--token-bg-elevated)', 'white');
    return resolveDirector3DColor(actor.color, 'slategray');
  }, [actor.color, renderMode]);

  const detailColors = useMemo(() => {
    if (renderMode === 'silhouette') {
      const silhouette = resolveDirector3DColor('var(--token-text-primary)', 'black');
      return { face: silhouette, chest: silhouette, back: silhouette, shoe: silhouette };
    }
    if (renderMode === 'lineart') {
      const ink = resolveDirector3DColor('var(--token-text-primary)', 'black');
      return { face: ink, chest: ink, back: ink, shoe: ink };
    }
    return {
      face: resolveDirector3DColor(LITE_DETAIL_COLORS.face, LITE_DETAIL_COLORS.face),
      chest: resolveDirector3DColor(LITE_DETAIL_COLORS.chest, LITE_DETAIL_COLORS.chest),
      back: resolveDirector3DColor(LITE_DETAIL_COLORS.back, LITE_DETAIL_COLORS.back),
      shoe: resolveDirector3DColor(LITE_DETAIL_COLORS.shoe, LITE_DETAIL_COLORS.shoe),
    };
  }, [renderMode]);

  const haloColor = useMemo(
    () => resolveDirector3DColor(selected ? 'var(--token-text-primary)' : 'var(--token-text-muted)', selected ? 'white' : 'gray'),
    [selected],
  );

  const useStandard = renderMode === 'preview';
  const opacity = renderMode === 'preview' ? 0.78 : 1;

  const bodyMaterial = useStandard ? (
    <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} transparent={opacity < 1} opacity={opacity} />
  ) : (
    <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} side={THREE.DoubleSide} />
  );
  const headMaterial = useStandard ? (
    <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} transparent={opacity < 1} opacity={opacity} />
  ) : (
    <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} side={THREE.DoubleSide} />
  );
  const renderDetailMaterial = (key: keyof typeof detailColors) => (useStandard ? (
    <meshStandardMaterial color={detailColors[key]} roughness={0.68} metalness={0.08} transparent={opacity < 1} opacity={opacity} />
  ) : (
    <meshBasicMaterial color={detailColors[key]} transparent={opacity < 1} opacity={opacity} side={THREE.DoubleSide} />
  ));

  // 关键 Y 坐标（actor.position 是脚底）：
  //   legTop = legLength = 0.75
  //   torsoCenter = legTop + torsoHeight/2 ≈ 1.025
  //   shoulderY = legTop + torsoHeight - 0.05 ≈ 1.25
  //   headCenter = shoulderY + headRadius + 0.04 ≈ 1.40
  const legTop = LITE_PROPS.legLength;
  const torsoCenter = legTop + LITE_PROPS.torsoHeight / 2;
  const shoulderY = legTop + LITE_PROPS.torsoHeight - 0.06;
  const headCenter = shoulderY + LITE_PROPS.headRadius + 0.04;
  const shoulderX = LITE_PROPS.shoulderWidth / 2 + LITE_PROPS.armRadius * 0.6;
  const hipX = LITE_PROPS.hipWidth / 2 - LITE_PROPS.legRadius * 0.2;

  return (
    <group
      position={actor.position}
      rotation={[0, actor.rotationY, 0]}
      scale={[actor.scale, actor.scale, actor.scale]}
      onPointerDown={onPointerDown}
    >
      {/* 接地圈 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0.22, 0.26, 20]} />
        <meshBasicMaterial color={haloColor} transparent opacity={selected ? 0.85 : 0.35} />
      </mesh>

      {/* 躯干：锥形圆柱，上宽下窄 = 肩膀 + 腰 */}
      <mesh position={[0, torsoCenter, 0]}>
        <cylinderGeometry args={[LITE_PROPS.torsoTop, LITE_PROPS.torsoBot, LITE_PROPS.torsoHeight, 14]} />
        {bodyMaterial}
      </mesh>
      <mesh position={[0, torsoCenter + 0.04, LITE_PROPS.torsoTop * 0.96]}>
        <boxGeometry args={[LITE_PROPS.shoulderWidth * 0.36, 0.14, 0.012]} />
        {renderDetailMaterial('chest')}
      </mesh>
      <mesh position={[0, torsoCenter, -LITE_PROPS.torsoTop * 0.98]}>
        <boxGeometry args={[0.04, LITE_PROPS.torsoHeight * 0.64, 0.012]} />
        {renderDetailMaterial('back')}
      </mesh>

      {/* 头 */}
      <mesh position={[0, headCenter, 0]}>
        <sphereGeometry args={[LITE_PROPS.headRadius, 16, 12]} />
        {headMaterial}
      </mesh>
      <mesh position={[0, headCenter + LITE_PROPS.headRadius * 0.08, LITE_PROPS.headRadius * 0.92]}>
        <boxGeometry args={[LITE_PROPS.headRadius * 0.72, LITE_PROPS.headRadius * 0.12, LITE_PROPS.headRadius * 0.07]} />
        {renderDetailMaterial('face')}
      </mesh>
      <mesh position={[0, headCenter - LITE_PROPS.headRadius * 0.18, LITE_PROPS.headRadius * 0.98]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[LITE_PROPS.headRadius * 0.12, LITE_PROPS.headRadius * 0.12, 10]} />
        {headMaterial}
      </mesh>

      {/* 手臂×2：挂在肩膀两侧 */}
      {([-1, 1] as const).map((sign) => (
        <mesh
          key={`arm-${sign}`}
          position={[sign * shoulderX, shoulderY - LITE_PROPS.armLength / 2, 0]}
        >
          <cylinderGeometry args={[LITE_PROPS.armRadius, LITE_PROPS.armRadius, LITE_PROPS.armLength, 10]} />
          {bodyMaterial}
        </mesh>
      ))}

      {/* 腿×2：从髋到脚底 */}
      {([-1, 1] as const).map((sign) => (
        <group key={`leg-${sign}`} position={[sign * hipX, 0, 0]}>
          <mesh position={[0, LITE_PROPS.legLength / 2, 0]}>
            <cylinderGeometry args={[LITE_PROPS.legRadius, LITE_PROPS.legRadius, LITE_PROPS.legLength, 10]} />
            {bodyMaterial}
          </mesh>
          <mesh position={[0, 0.03, 0.08]}>
            <boxGeometry args={[0.11, 0.055, 0.18]} />
            {renderDetailMaterial('shoe')}
          </mesh>
        </group>
      ))}

      {/* 选中光环 */}
      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
          <ringGeometry args={[0.28, 0.34, 28]} />
          <meshBasicMaterial color={haloColor} transparent opacity={0.65} />
        </mesh>
      ) : null}
    </group>
  );
};

export default Director3DLiteMannequin;
