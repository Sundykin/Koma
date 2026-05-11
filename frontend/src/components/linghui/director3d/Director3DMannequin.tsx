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
      return { body: silhouette, head: silhouette, accent: silhouette };
    }
    if (renderMode === 'lineart') {
      const lineart = resolveDirector3DColor('var(--token-bg-elevated)', 'white');
      return { body: lineart, head: lineart, accent: lineart };
    }
    const actorColor = resolveDirector3DColor(actor.color, 'steelblue');
    return { body: actorColor, head: actorColor, accent: actorColor };
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

  const renderBodyMaterial = (
    materialKey: 'body' | 'head',
    roughness = 0.7,
    metalness = 0.1,
  ) => (useStandard ? (
    <meshStandardMaterial color={colors[materialKey]} roughness={roughness} metalness={metalness} />
  ) : (
    <meshBasicMaterial color={colors[materialKey]} />
  ));

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
              {/* thigh */}
              <mesh position={[0, -PROPORTIONS.thighLength * 0.5, 0]}>
                <cylinderGeometry args={[PROPORTIONS.legRadius, PROPORTIONS.legRadius * 0.9, PROPORTIONS.thighLength, 12]} />
                {renderBodyMaterial('body', 0.75, 0.05)}
              </mesh>
              {/* 膝盖关节 + shin */}
              <group position={[0, -PROPORTIONS.thighLength, 0]} rotation={knee}>
                <mesh position={[0, -PROPORTIONS.shinLength * 0.5, 0]}>
                  <cylinderGeometry args={[PROPORTIONS.legRadius * 0.9, PROPORTIONS.legRadius * 0.75, PROPORTIONS.shinLength, 12]} />
                  {renderBodyMaterial('body', 0.75, 0.05)}
                </mesh>
                {/* 脚 */}
                <mesh position={[0, -PROPORTIONS.shinLength - 0.025, 0.06]}>
                  <boxGeometry args={[0.12, 0.05, 0.22]} />
                  {renderBodyMaterial('body', 0.7, 0.1)}
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

          {/* neck → head */}
          <group
            position={[0, PROPORTIONS.torsoHeight * 0.5 + 0.02, 0]}
            rotation={rig.neck}
          >
            <mesh position={[0, PROPORTIONS.headRadius + 0.04, 0]}>
              <sphereGeometry args={[PROPORTIONS.headRadius, 24, 18]} />
              {renderBodyMaterial('head', 0.6, 0.05)}
            </mesh>
            {/* 鼻尖：标识朝向 */}
            <mesh position={[0, PROPORTIONS.headRadius + 0.04, PROPORTIONS.headRadius * 0.85]}>
              <sphereGeometry args={[PROPORTIONS.headRadius * 0.18, 12, 8]} />
              {renderBodyMaterial('head', 0.6, 0.05)}
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
                {/* upperArm */}
                <mesh position={[0, -PROPORTIONS.upperArmLength * 0.5, 0]}>
                  <cylinderGeometry args={[PROPORTIONS.armRadius, PROPORTIONS.armRadius * 0.9, PROPORTIONS.upperArmLength, 12]} />
                  {renderBodyMaterial('body', 0.7, 0.1)}
                </mesh>
                {/* 肘关节 + forearm */}
                <group position={[0, -PROPORTIONS.upperArmLength, 0]} rotation={elbow}>
                  <mesh position={[0, -PROPORTIONS.forearmLength * 0.5, 0]}>
                    <cylinderGeometry args={[PROPORTIONS.armRadius * 0.9, PROPORTIONS.armRadius * 0.75, PROPORTIONS.forearmLength, 12]} />
                    {renderBodyMaterial('body', 0.7, 0.1)}
                  </mesh>
                  {/* 手部：稍微鼓出，帮助看朝向 */}
                  <mesh position={[0, -PROPORTIONS.forearmLength - PROPORTIONS.armRadius * 0.6, 0]}>
                    <sphereGeometry args={[PROPORTIONS.armRadius * 1.05, 12, 8]} />
                    {renderBodyMaterial('body', 0.7, 0.1)}
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
