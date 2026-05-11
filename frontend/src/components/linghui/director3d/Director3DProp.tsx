/**
 * Director3D 道具几何。
 *
 * 与 Director3DMannequin 平级：同样消费 LinghuiDirector3DActor（position/rotationY/scale/color），
 * 但根据 actor.type 渲染不同的简单几何（box / cylinder / plane / camera 模型 / 箭头），
 * 用于在场景里摆桌椅、墙板、副机位、视线箭头等辅助构图元素。
 *
 * 道具的 posePreset 字段被忽略；其余字段（颜色/缩放/朝向）与假人一致。
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { LinghuiDirector3DActor } from '../../../types/linghui';
import { resolveDirector3DColor } from './director3dColors';

interface Director3DPropProps {
  actor: LinghuiDirector3DActor;
  selected?: boolean;
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  onPointerDown?: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => void;
}

export const Director3DProp: React.FC<Director3DPropProps> = ({ actor, selected, renderMode = 'preview', onPointerDown }) => {
  const color = useMemo(() => {
    if (renderMode === 'silhouette') return resolveDirector3DColor('var(--token-text-primary)', 'black');
    if (renderMode === 'lineart') return resolveDirector3DColor('var(--token-bg-elevated)', 'white');
    return resolveDirector3DColor(actor.color, 'gray');
  }, [actor.color, renderMode]);

  const haloColor = useMemo(
    () => resolveDirector3DColor(selected ? 'var(--token-text-primary)' : 'var(--token-text-muted)', selected ? 'white' : 'gray'),
    [selected],
  );

  const material = renderMode === 'preview'
    ? <meshStandardMaterial color={color} roughness={0.65} metalness={0.12} />
    : <meshBasicMaterial color={color} />;

  return (
    <group
      position={actor.position}
      rotation={[0, actor.rotationY, 0]}
      scale={[actor.scale, actor.scale, actor.scale]}
      onPointerDown={onPointerDown}
    >
      {actor.type === 'prop-box' && (
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.9, 0.8, 0.6]} />
          {material}
        </mesh>
      )}

      {actor.type === 'prop-cylinder' && (
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.35, 0.35, 0.9, 24]} />
          {material}
        </mesh>
      )}

      {actor.type === 'prop-plane' && (
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[1.6, 2, 0.05]} />
          {material}
        </mesh>
      )}

      {actor.type === 'prop-camera' && (
        <group position={[0, 0.5, 0]}>
          <mesh>
            <boxGeometry args={[0.4, 0.3, 0.55]} />
            {material}
          </mesh>
          <mesh position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 0.25, 18]} />
            {material}
          </mesh>
          {/* 取景方向指示：从相机正前方伸出一条细线 */}
          <mesh position={[0, 0, 1.05]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 1.2, 8]} />
            <meshBasicMaterial color={resolveDirector3DColor('var(--token-status-info)', 'deepskyblue')} />
          </mesh>
        </group>
      )}

      {actor.type === 'prop-arrow' && (
        <group position={[0, 0.05, 0]}>
          <mesh position={[0, 0.05, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1, 12]} />
            {material}
          </mesh>
          <mesh position={[0, 0.05, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.16, 0.32, 18]} />
            {material}
          </mesh>
        </group>
      )}

      {/* 接地圈，与 Mannequin 视觉一致 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.28, 0.32, 24]} />
        <meshBasicMaterial color={haloColor} transparent opacity={selected ? 0.85 : 0.35} />
      </mesh>

      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[0.34, 0.4, 32]} />
          <meshBasicMaterial color={haloColor} transparent opacity={0.65} />
        </mesh>
      ) : null}
    </group>
  );
};

export default Director3DProp;
