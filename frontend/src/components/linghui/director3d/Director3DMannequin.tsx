/**
 * Director3D 假人模型。procedural mesh，不依赖任何 GLTF 资产。
 *
 * 由 head + torso + arms + legs 拼出来，按 posePreset 调一些静态摆位
 * （MVP 阶段不做骨骼/IK，姿势预设直接用旋转值）。
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DActorPose,
} from '../../../types/linghui';
import { resolveDirector3DColor } from './director3dColors';

interface PosePreset {
  leftArm: [number, number, number];
  rightArm: [number, number, number];
  leftLeg: [number, number, number];
  rightLeg: [number, number, number];
  torsoTilt: number;
}

const POSE_PRESETS: Record<LinghuiDirector3DActorPose, PosePreset> = {
  idle: {
    leftArm: [0, 0, 0.05],
    rightArm: [0, 0, -0.05],
    leftLeg: [0, 0, 0],
    rightLeg: [0, 0, 0],
    torsoTilt: 0,
  },
  walk: {
    leftArm: [-0.5, 0, 0.05],
    rightArm: [0.5, 0, -0.05],
    leftLeg: [0.4, 0, 0],
    rightLeg: [-0.4, 0, 0],
    torsoTilt: -0.06,
  },
  run: {
    leftArm: [-0.9, 0, 0.05],
    rightArm: [0.9, 0, -0.05],
    leftLeg: [0.7, 0, 0],
    rightLeg: [-0.7, 0, 0],
    torsoTilt: -0.18,
  },
  sit: {
    leftArm: [0, 0, 0.05],
    rightArm: [0, 0, -0.05],
    leftLeg: [-1.4, 0, 0.06],
    rightLeg: [-1.4, 0, -0.06],
    torsoTilt: 0,
  },
  wave: {
    leftArm: [0, 0, 0.05],
    rightArm: [-2.4, 0, -0.18],
    leftLeg: [0, 0, 0],
    rightLeg: [0, 0, 0],
    torsoTilt: 0,
  },
  point: {
    leftArm: [0, 0, 0.05],
    rightArm: [-1.4, 0.4, -0.05],
    leftLeg: [0, 0, 0],
    rightLeg: [0, 0, 0],
    torsoTilt: 0,
  },
};

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
  armLength: 0.55,
  armRadius: 0.06,
  legLength: 0.86,
  legRadius: 0.08,
  hipWidth: 0.18,
  shoulderWidth: 0.36,
  feetGap: 0.12,
};

export const Director3DMannequin: React.FC<Director3DMannequinProps> = ({
  actor,
  selected,
  renderMode = 'preview',
  onPointerDown,
}) => {
  const pose = POSE_PRESETS[actor.posePreset] ?? POSE_PRESETS.idle;
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
  const feetY = 0;
  const legTopY = feetY + PROPORTIONS.legLength;
  const torsoCenterY = legTopY + PROPORTIONS.torsoHeight * 0.5;
  const shoulderY = legTopY + PROPORTIONS.torsoHeight - 0.05;
  const headCenterY = shoulderY + PROPORTIONS.headRadius + 0.04;
  const sx = (sign: number) => (PROPORTIONS.shoulderWidth * 0.5 + PROPORTIONS.armRadius * 0.5) * sign;
  const hx = (sign: number) => (PROPORTIONS.hipWidth * 0.5 + PROPORTIONS.legRadius * 0.5) * sign;

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

      {/* torso */}
      <group position={[0, torsoCenterY, 0]} rotation={[pose.torsoTilt, 0, 0]}>
        <mesh>
          <boxGeometry args={[PROPORTIONS.torsoWidth, PROPORTIONS.torsoHeight, PROPORTIONS.torsoDepth]} />
          {useStandard ? (
            <meshStandardMaterial color={colors.body} roughness={0.7} metalness={0.1} />
          ) : (
            <meshBasicMaterial color={colors.body} />
          )}
        </mesh>

        {/* head */}
        <mesh position={[0, PROPORTIONS.torsoHeight * 0.5 + PROPORTIONS.headRadius + 0.04, 0]}>
          <sphereGeometry args={[PROPORTIONS.headRadius, 24, 18]} />
          {useStandard ? (
            <meshStandardMaterial color={colors.head} roughness={0.6} metalness={0.05} />
          ) : (
            <meshBasicMaterial color={colors.head} />
          )}
        </mesh>

        {/* arms */}
        {(['left', 'right'] as const).map((side) => {
          const sign = side === 'left' ? 1 : -1;
          const rot = side === 'left' ? pose.leftArm : pose.rightArm;
          return (
            <group key={side} position={[sx(sign), PROPORTIONS.torsoHeight * 0.5 - 0.04, 0]} rotation={rot as [number, number, number]}>
              <mesh position={[0, -PROPORTIONS.armLength * 0.5, 0]}>
                <cylinderGeometry args={[PROPORTIONS.armRadius, PROPORTIONS.armRadius, PROPORTIONS.armLength, 12]} />
                {useStandard ? (
                  <meshStandardMaterial color={colors.body} roughness={0.7} metalness={0.1} />
                ) : (
                  <meshBasicMaterial color={colors.body} />
                )}
              </mesh>
            </group>
          );
        })}
      </group>

      {/* legs */}
      {(['left', 'right'] as const).map((side) => {
        const sign = side === 'left' ? 1 : -1;
        const rot = side === 'left' ? pose.leftLeg : pose.rightLeg;
        return (
          <group key={side} position={[hx(sign), legTopY, 0]} rotation={(rot.map((v, i) => i === 0 ? v * 0.6 : v) as [number, number, number])}>
            <mesh position={[0, -PROPORTIONS.legLength * 0.5, 0]}>
              <cylinderGeometry args={[PROPORTIONS.legRadius, PROPORTIONS.legRadius, PROPORTIONS.legLength, 12]} />
              {useStandard ? (
                <meshStandardMaterial color={colors.body} roughness={0.75} metalness={0.05} />
              ) : (
                <meshBasicMaterial color={colors.body} />
              )}
            </mesh>
          </group>
        );
      })}

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
