/**
 * Director3D 主角假人。procedural mesh，不依赖任何 GLTF 资产。
 *
 * 骨骼分层：
 *   root → spine → torso
 *                    ├── neck → head
 *                    ├── left/right shoulder → upperArm
 *                    │                              └── elbow → forearm
 *                    └── (hip via root) → left/right hip → thigh
 *                                                            └── knee → shin
 *
 * 姿态来源（优先级）：
 *   actor.rig（用户精确调过的骨骼）> RIG_PRESETS[actor.posePreset]（预置）
 *
 * 老 scene 没有 rig 时仍能正确渲染（通过 resolveActorRig 兜底）。
 */
import React, { useMemo } from 'react';
import type {
  LinghuiDirector3DActor,
} from '../../../types/linghui';
import { resolveDirector3DColor } from './director3dColors';
import { resolveActorRig, type Director3DRig } from './director3dRig';

interface Director3DMannequinProps {
  actor: LinghuiDirector3DActor;
  selected?: boolean;
  /** lineart / silhouette 等渲染模式：决定是否走纯黑边、纯色填充 */
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  onPointerDown?: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => void;
}

/** 1.75 米身高的人体比例（单位 = 米）。 */
const PROPORTIONS = {
  totalHeight: 1.75,
  headRadius: 0.12,
  torsoHeight: 0.6,
  torsoWidth: 0.36,
  torsoDepth: 0.2,
  upperArmLength: 0.28,
  forearmLength: 0.27,
  armRadius: 0.06,
  thighLength: 0.45,
  shinLength: 0.41,
  legRadius: 0.08,
  hipWidth: 0.18,
  shoulderWidth: 0.36,
};

const HASH = String.fromCharCode(35);
const DETAIL_COLORS = {
  dark: `${HASH}17181d`,
  light: `${HASH}f8f1df`,
  skin: `${HASH}f1c7a6`,
  warm: `${HASH}d9863d`,
  cool: `${HASH}2d6cdf`,
  back: `${HASH}4c566a`,
  shoe: `${HASH}101217`,
  cloth: `${HASH}26384f`,
};

export const Director3DMannequin: React.FC<Director3DMannequinProps> = ({
  actor,
  selected,
  renderMode = 'preview',
  onPointerDown,
}) => {
  const rig: Director3DRig = useMemo(
    () => resolveActorRig(actor.rig, actor.posePreset),
    [actor.rig, actor.posePreset],
  );

  const colors = useMemo(() => {
    if (renderMode === 'silhouette') {
      const silhouette = resolveDirector3DColor('var(--token-text-primary)', 'black');
      return {
        body: silhouette,
        head: silhouette,
        accent: silhouette,
        face: silhouette,
        marker: silhouette,
        joint: silhouette,
        back: silhouette,
        shoe: silhouette,
        cloth: silhouette,
      };
    }
    if (renderMode === 'lineart') {
      const lineart = resolveDirector3DColor('var(--token-bg-elevated)', 'white');
      const ink = resolveDirector3DColor('var(--token-text-primary)', DETAIL_COLORS.dark);
      return {
        body: lineart,
        head: lineart,
        accent: ink,
        face: ink,
        marker: ink,
        joint: ink,
        back: ink,
        shoe: ink,
        cloth: ink,
      };
    }
    const actorColor = resolveDirector3DColor(actor.color, 'steelblue');
    return {
      body: actorColor,
      head: resolveDirector3DColor(DETAIL_COLORS.skin, DETAIL_COLORS.skin),
      accent: resolveDirector3DColor(DETAIL_COLORS.warm, DETAIL_COLORS.warm),
      face: resolveDirector3DColor(DETAIL_COLORS.dark, DETAIL_COLORS.dark),
      marker: resolveDirector3DColor(DETAIL_COLORS.cool, DETAIL_COLORS.cool),
      joint: resolveDirector3DColor(DETAIL_COLORS.light, DETAIL_COLORS.light),
      shoe: resolveDirector3DColor(DETAIL_COLORS.shoe, DETAIL_COLORS.shoe),
      cloth: resolveDirector3DColor(DETAIL_COLORS.cloth, DETAIL_COLORS.cloth),
    };
  }, [actor.color, renderMode]);

  const ringColors = useMemo(() => ({
    selected: resolveDirector3DColor('var(--token-text-primary)', 'white'),
    idle: resolveDirector3DColor('var(--token-text-muted)', 'gray'),
  }), []);

  const useStandard = renderMode === 'preview';

  // 接地点：position 是脚底；构造时把整体抬到腿+躯干+头的高度
  const legTotalLength = PROPORTIONS.thighLength + PROPORTIONS.shinLength;
  const feetY = 0;
  const hipY = feetY + legTotalLength;
  const torsoCenterY = hipY + PROPORTIONS.torsoHeight * 0.5;
  const shoulderY = hipY + PROPORTIONS.torsoHeight - 0.05;
  const sx = (sign: number) => (PROPORTIONS.shoulderWidth * 0.5 + PROPORTIONS.armRadius * 0.5) * sign;
  const hx = (sign: number) => (PROPORTIONS.hipWidth * 0.5 + PROPORTIONS.legRadius * 0.5) * sign;

  const renderMaterial = (
    materialKey: keyof typeof colors,
    roughness = 0.7,
    metalness = 0.1,
  ) => (useStandard ? (
    <meshStandardMaterial color={colors[materialKey]} roughness={roughness} metalness={metalness} />
  ) : (
    <meshBasicMaterial color={colors[materialKey]} />
  ));

  const renderBodyMaterial = (materialKey: 'body' | 'head', roughness = 0.7, metalness = 0.1) => (
    renderMaterial(materialKey, roughness, metalness)
  );

  return (
    <group
      position={actor.position}
      rotation={[0, actor.rotationY, 0]}
      scale={[actor.scale, actor.scale, actor.scale]}
      onPointerDown={onPointerDown}
    >
      {/* 接地圈：辅助看脚底位置 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.3, 0.34, 24]} />
        <meshBasicMaterial color={selected ? ringColors.selected : ringColors.idle} transparent opacity={selected ? 0.85 : 0.45} />
      </mesh>

      {/* 髋部锚点（腿挂这里，不随 spine 倾斜走） */}
      <group position={[0, hipY, 0]}>
        {(['left', 'right'] as const).map((side) => {
          const sign = side === 'left' ? 1 : -1;
          const hip = side === 'left' ? rig.leftHip : rig.rightHip;
          const knee = side === 'left' ? rig.leftKnee : rig.rightKnee;
          return (
            <group key={side} position={[hx(sign), 0, 0]} rotation={hip}>
              <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[PROPORTIONS.legRadius * 1.05, 16, 10]} />
                {renderMaterial('joint', 0.65, 0.08)}
              </mesh>
              {/* thigh */}
              <mesh position={[0, -PROPORTIONS.thighLength * 0.5, 0]}>
                <cylinderGeometry args={[PROPORTIONS.legRadius, PROPORTIONS.legRadius * 0.9, PROPORTIONS.thighLength, 12]} />
                {renderBodyMaterial('body', 0.75, 0.05)}
              </mesh>
              {/* 膝盖关节 + shin */}
              <group position={[0, -PROPORTIONS.thighLength, 0]} rotation={knee}>
                <mesh>
                  <sphereGeometry args={[PROPORTIONS.legRadius * 1.08, 16, 10]} />
                  {renderMaterial('joint', 0.65, 0.08)}
                </mesh>
                <mesh position={[0, -PROPORTIONS.shinLength * 0.5, 0]}>
                  <cylinderGeometry args={[PROPORTIONS.legRadius * 0.9, PROPORTIONS.legRadius * 0.75, PROPORTIONS.shinLength, 12]} />
                  {renderBodyMaterial('body', 0.75, 0.05)}
                </mesh>
                {/* 脚 */}
                <mesh position={[0, -PROPORTIONS.shinLength - 0.025, 0.06]}>
                  <boxGeometry args={[0.12, 0.05, 0.22]} />
                  {renderMaterial('shoe', 0.78, 0.15)}
                </mesh>
                <mesh position={[0, -PROPORTIONS.shinLength - 0.018, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
                  <coneGeometry args={[0.06, 0.08, 12]} />
                  {renderMaterial('shoe', 0.78, 0.15)}
                </mesh>
              </group>
            </group>
          );
        })}
      </group>

      {/* spine → torso（躯干前后倾 / 左右倾 / 转身都跟着 spine） */}
      <group position={[0, hipY, 0]} rotation={rig.spine}>
        <group position={[0, PROPORTIONS.torsoHeight * 0.5, 0]}>
          <mesh>
            <boxGeometry args={[PROPORTIONS.torsoWidth, PROPORTIONS.torsoHeight, PROPORTIONS.torsoDepth]} />
            {renderBodyMaterial('body', 0.7, 0.1)}
          </mesh>
          {/* 正面胸牌 / 腰带 / 背脊线：让截图和线稿都能看出前后 */}
          <mesh position={[0, 0.12, PROPORTIONS.torsoDepth * 0.51]}>
            <boxGeometry args={[PROPORTIONS.torsoWidth * 0.48, 0.18, 0.012]} />
            {renderMaterial('marker', 0.55, 0.12)}
          </mesh>
          <mesh position={[-PROPORTIONS.torsoWidth * 0.13, 0.245, PROPORTIONS.torsoDepth * 0.535]} rotation={[0, 0, -0.55]}>
            <boxGeometry args={[PROPORTIONS.torsoWidth * 0.34, 0.035, 0.012]} />
            {renderMaterial('cloth', 0.72, 0.06)}
          </mesh>
          <mesh position={[PROPORTIONS.torsoWidth * 0.13, 0.245, PROPORTIONS.torsoDepth * 0.535]} rotation={[0, 0, 0.55]}>
            <boxGeometry args={[PROPORTIONS.torsoWidth * 0.34, 0.035, 0.012]} />
            {renderMaterial('cloth', 0.72, 0.06)}
          </mesh>
          <mesh position={[0, -0.17, PROPORTIONS.torsoDepth * 0.53]}>
            <boxGeometry args={[PROPORTIONS.torsoWidth * 0.94, 0.035, 0.014]} />
            {renderMaterial('accent', 0.62, 0.12)}
          </mesh>
          <mesh position={[0, 0.02, -PROPORTIONS.torsoDepth * 0.53]}>
            <boxGeometry args={[0.055, PROPORTIONS.torsoHeight * 0.72, 0.014]} />
            {renderMaterial('back', 0.66, 0.08)}
          </mesh>
          <mesh position={[0, PROPORTIONS.torsoHeight * 0.5 - 0.035, 0]}>
            <boxGeometry args={[PROPORTIONS.shoulderWidth * 1.04, 0.055, PROPORTIONS.torsoDepth * 1.12]} />
            {renderMaterial('joint', 0.7, 0.05)}
          </mesh>

          {/* neck → head */}
          <group
            position={[0, PROPORTIONS.torsoHeight * 0.5 + 0.02, 0]}
            rotation={rig.neck}
          >
            <mesh position={[0, PROPORTIONS.headRadius + 0.04, 0]}>
              <sphereGeometry args={[PROPORTIONS.headRadius, 24, 18]} />
              {renderBodyMaterial('head', 0.6, 0.05)}
            </mesh>
            {/* 面部：眼睛 / 眉线 / 鼻梁 / 嘴，让主角正面可读 */}
            {([-1, 1] as const).map(sign => (
              <mesh
                key={`eye-${sign}`}
                position={[sign * PROPORTIONS.headRadius * 0.42, PROPORTIONS.headRadius + 0.07, PROPORTIONS.headRadius * 0.88]}
              >
                <sphereGeometry args={[PROPORTIONS.headRadius * 0.11, 10, 8]} />
                {renderMaterial('face', 0.45, 0.05)}
              </mesh>
            ))}
            <mesh position={[0, PROPORTIONS.headRadius + 0.105, PROPORTIONS.headRadius * 0.9]}>
              <boxGeometry args={[PROPORTIONS.headRadius * 0.98, PROPORTIONS.headRadius * 0.06, PROPORTIONS.headRadius * 0.08]} />
              {renderMaterial('face', 0.45, 0.05)}
            </mesh>
            <mesh position={[0, PROPORTIONS.headRadius + 0.025, PROPORTIONS.headRadius * 0.98]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[PROPORTIONS.headRadius * 0.16, PROPORTIONS.headRadius * 0.14, 12]} />
              {renderBodyMaterial('head', 0.58, 0.05)}
            </mesh>
            <mesh position={[0, PROPORTIONS.headRadius - 0.04, PROPORTIONS.headRadius * 0.91]}>
              <boxGeometry args={[PROPORTIONS.headRadius * 0.56, PROPORTIONS.headRadius * 0.045, PROPORTIONS.headRadius * 0.05]} />
              {renderMaterial('face', 0.45, 0.05)}
            </mesh>
            {([-1, 1] as const).map(sign => (
              <mesh
                key={`ear-${sign}`}
                position={[sign * PROPORTIONS.headRadius * 0.98, PROPORTIONS.headRadius + 0.035, 0]}
                scale={[0.55, 0.82, 0.22]}
              >
                <sphereGeometry args={[PROPORTIONS.headRadius * 0.22, 10, 8]} />
                {renderBodyMaterial('head', 0.62, 0.05)}
              </mesh>
            ))}
            <mesh position={[0, PROPORTIONS.headRadius + 0.12, -PROPORTIONS.headRadius * 0.82]}>
              <boxGeometry args={[PROPORTIONS.headRadius * 0.82, PROPORTIONS.headRadius * 0.18, PROPORTIONS.headRadius * 0.08]} />
              {renderMaterial('back', 0.6, 0.08)}
            </mesh>
          </group>

          {/* arms */}
          {(['left', 'right'] as const).map((side) => {
            const sign = side === 'left' ? 1 : -1;
            const shoulder = side === 'left' ? rig.leftShoulder : rig.rightShoulder;
            const elbow = side === 'left' ? rig.leftElbow : rig.rightElbow;
            return (
              <group
                key={side}
                position={[sx(sign), PROPORTIONS.torsoHeight * 0.5 - 0.04, 0]}
                rotation={shoulder}
              >
                <mesh>
                  <sphereGeometry args={[PROPORTIONS.armRadius * 1.18, 16, 10]} />
                  {renderMaterial('joint', 0.65, 0.08)}
                </mesh>
                {/* upperArm */}
                <mesh position={[0, -PROPORTIONS.upperArmLength * 0.5, 0]}>
                  <cylinderGeometry args={[PROPORTIONS.armRadius, PROPORTIONS.armRadius * 0.9, PROPORTIONS.upperArmLength, 12]} />
                  {renderBodyMaterial('body', 0.7, 0.1)}
                </mesh>
                {/* 肘关节 + forearm */}
                <group position={[0, -PROPORTIONS.upperArmLength, 0]} rotation={elbow}>
                  <mesh>
                    <sphereGeometry args={[PROPORTIONS.armRadius * 1.05, 14, 10]} />
                    {renderMaterial('joint', 0.65, 0.08)}
                  </mesh>
                  <mesh position={[0, -PROPORTIONS.forearmLength * 0.5, 0]}>
                    <cylinderGeometry args={[PROPORTIONS.armRadius * 0.9, PROPORTIONS.armRadius * 0.75, PROPORTIONS.forearmLength, 12]} />
                    {renderBodyMaterial('body', 0.7, 0.1)}
                  </mesh>
                  {/* 手部：稍微鼓出，帮助看朝向 */}
                  <mesh position={[0, -PROPORTIONS.forearmLength - PROPORTIONS.armRadius * 0.6, 0]}>
                    <sphereGeometry args={[PROPORTIONS.armRadius * 1.05, 14, 10]} />
                    {renderBodyMaterial('head', 0.65, 0.04)}
                  </mesh>
                  <mesh
                    position={[sign * PROPORTIONS.armRadius * 0.7, -PROPORTIONS.forearmLength - PROPORTIONS.armRadius * 0.5, PROPORTIONS.armRadius * 0.58]}
                    rotation={[0, 0, sign * 0.55]}
                  >
                    <sphereGeometry args={[PROPORTIONS.armRadius * 0.38, 10, 8]} />
                    {renderBodyMaterial('head', 0.65, 0.04)}
                  </mesh>
                </group>
              </group>
            );
          })}
        </group>

        {/* 上身保留 torsoCenterY 占位，确保 selection halo 高度跟 spine 走 */}
        {selected ? (
          <mesh position={[0, torsoCenterY - hipY, 0]} visible={false}>
            <boxGeometry args={[0.01, 0.01, 0.01]} />
            <meshBasicMaterial />
          </mesh>
        ) : null}
      </group>

      {/* selection halo */}
      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[0.36, 0.42, 32]} />
          <meshBasicMaterial color={ringColors.selected} transparent opacity={0.7} />
        </mesh>
      ) : null}
    </group>
  );
};

export default Director3DMannequin;
