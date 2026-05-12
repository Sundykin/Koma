/**
 * Director3D 生物（动物 + 玄幻生物）渲染组件。
 *
 * 几何拼装：根据 species.form：
 *  - quadruped：长躯干 + 4 条腿 + 头 + 尾 + 可选鬃毛 / 犄角
 *  - avian：直立短躯干 + 2 条腿 + 大翅膀 + 尖喙头部 + 长尾羽
 *  - serpent-dragon：分段长躯干 + 4 爪 + 翼 + 龙头 + 长尾
 *
 * 关节动画：creatureRig 缺失时按 creatureAction 兜底（CREATURE_ACTION_RIGS 表）；
 * timeline 插值时由 director3dScene.interpolateSceneAt 走 lerpCreatureRig。
 */
import React, { useMemo } from 'react';
import type { LinghuiDirector3DActor } from '../../../types/linghui';
import { resolveDirector3DColor } from './director3dColors';
import {
  CREATURE_ACTION_RIGS,
  findCreatureSpecies,
  resolveCreatureRig,
  type CreatureRig,
  type CreatureSpeciesSpec,
} from './director3dCreature';

interface Director3DCreatureProps {
  actor: LinghuiDirector3DActor;
  selected?: boolean;
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  onPointerDown?: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => void;
}

function bodyMaterial(color: string, useStandard: boolean, roughness = 0.7, metalness = 0.05) {
  return useStandard ? (
    <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
  ) : (
    <meshBasicMaterial color={color} />
  );
}

function QuadrupedBody({ species, rig, color, useStandard }: {
  species: CreatureSpeciesSpec;
  rig: CreatureRig;
  color: string;
  useStandard: boolean;
}) {
  const bodyY = species.bodyHeight * 0.62;
  const legLen = species.bodyHeight * 0.55;
  const legRadius = species.bodyLength * 0.05;
  const bodyWidth = species.bodyLength * 0.28;
  const bodyHeight = species.bodyHeight * 0.4;
  const tailLength = species.bodyLength * 0.45;
  const tailRadius = species.bodyLength * 0.04;
  const headSize = species.bodyHeight * 0.2;
  const neckLength = species.bodyHeight * 0.35;

  // 四足布点：身体长边沿 +Z，前在 +Z，后在 -Z
  const frontZ = species.bodyLength * 0.32;
  const rearZ = -species.bodyLength * 0.32;
  const sideX = bodyWidth * 0.5;

  return (
    <group>
      {/* 躯干（带 spine 旋转） */}
      <group position={[0, bodyY, 0]} rotation={rig.spine}>
        <mesh>
          <boxGeometry args={[bodyWidth, bodyHeight, species.bodyLength * 0.7]} />
          {bodyMaterial(color, useStandard, 0.7, 0.05)}
        </mesh>

        {/* 鬣毛（lion / qilin / horse） */}
        {species.hasMane && (
          <mesh position={[0, bodyHeight * 0.4, frontZ * 0.6]}>
            <sphereGeometry args={[bodyWidth * 0.7, 16, 12]} />
            {bodyMaterial(species.kind === 'horse' ? '#4a3020' : '#8a5a30', useStandard, 0.9, 0)}
          </mesh>
        )}

        {/* 颈 + 头 */}
        <group position={[0, bodyHeight * 0.4, frontZ * 0.55]} rotation={rig.neck}>
          <mesh position={[0, neckLength * 0.5, neckLength * 0.4]} rotation={[Math.PI / 6, 0, 0]}>
            <cylinderGeometry args={[headSize * 0.5, headSize * 0.7, neckLength, 10]} />
            {bodyMaterial(color, useStandard, 0.7, 0.05)}
          </mesh>
          <mesh position={[0, neckLength * 0.85, neckLength * 0.75]}>
            <boxGeometry args={[headSize, headSize, headSize * 1.4]} />
            {bodyMaterial(color, useStandard, 0.6, 0.05)}
          </mesh>
          {/* 犄角 / 鹿角（qilin / deer / dragon） */}
          {species.hasHorns && (
            <>
              <mesh position={[headSize * 0.4, neckLength + headSize * 0.5, neckLength * 0.6]} rotation={[0, 0, 0.4]}>
                <cylinderGeometry args={[0.02, 0.05, headSize * 1.5, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.5, 0.2)}
              </mesh>
              <mesh position={[-headSize * 0.4, neckLength + headSize * 0.5, neckLength * 0.6]} rotation={[0, 0, -0.4]}>
                <cylinderGeometry args={[0.02, 0.05, headSize * 1.5, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.5, 0.2)}
              </mesh>
            </>
          )}
        </group>

        {/* 尾巴 */}
        <group position={[0, 0, -species.bodyLength * 0.34]} rotation={rig.tail}>
          <mesh position={[0, 0, -tailLength * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[tailRadius * 0.4, tailRadius, tailLength, 8]} />
            {bodyMaterial(color, useStandard, 0.7, 0.05)}
          </mesh>
        </group>
      </group>

      {/* 4 条腿（不跟 spine 转，挂在 root） */}
      {([
        { rig: rig.frontLeftLeg, pos: [sideX, bodyY * 0.78, frontZ] },
        { rig: rig.frontRightLeg, pos: [-sideX, bodyY * 0.78, frontZ] },
        { rig: rig.rearLeftLeg, pos: [sideX, bodyY * 0.78, rearZ] },
        { rig: rig.rearRightLeg, pos: [-sideX, bodyY * 0.78, rearZ] },
      ] as const).map((leg, idx) => (
        <group key={idx} position={leg.pos as [number, number, number]} rotation={leg.rig}>
          <mesh position={[0, -legLen * 0.5, 0]}>
            <cylinderGeometry args={[legRadius * 0.7, legRadius, legLen, 8]} />
            {bodyMaterial(color, useStandard, 0.75, 0.05)}
          </mesh>
        </group>
      ))}
    </group>
  );
}

function AvianBody({ species, rig, color, useStandard }: {
  species: CreatureSpeciesSpec;
  rig: CreatureRig;
  color: string;
  useStandard: boolean;
}) {
  const bodyY = species.bodyHeight * 0.45;
  const legLen = species.bodyHeight * 0.4;
  const bodyHeight = species.bodyHeight * 0.45;
  const wingSpan = species.bodyLength * 1.8;
  const wingChord = species.bodyLength * 0.32;
  const beakLen = species.bodyHeight * 0.12;
  const tailLen = species.bodyLength * 0.7;

  return (
    <group>
      {/* 躯干 */}
      <group position={[0, bodyY, 0]} rotation={rig.spine}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[bodyHeight * 0.4, bodyHeight * 0.3, species.bodyLength * 0.7, 12]} />
          {bodyMaterial(color, useStandard, 0.7, 0.05)}
        </mesh>

        {/* 颈 + 头 */}
        <group position={[0, bodyHeight * 0.35, species.bodyLength * 0.25]} rotation={rig.neck}>
          <mesh rotation={[Math.PI / 2.4, 0, 0]}>
            <cylinderGeometry args={[bodyHeight * 0.18, bodyHeight * 0.25, bodyHeight * 0.5, 10]} />
            {bodyMaterial(color, useStandard, 0.7, 0.05)}
          </mesh>
          <mesh position={[0, bodyHeight * 0.4, bodyHeight * 0.2]}>
            <sphereGeometry args={[bodyHeight * 0.2, 16, 12]} />
            {bodyMaterial(color, useStandard, 0.6, 0.05)}
          </mesh>
          {/* 喙 */}
          <mesh position={[0, bodyHeight * 0.35, bodyHeight * 0.32]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[bodyHeight * 0.08, beakLen, 6]} />
            {bodyMaterial('#d8a020', useStandard, 0.4, 0.1)}
          </mesh>
        </group>

        {/* 翅膀（frontLeft/Right 当翼根用） */}
        <group position={[0, bodyHeight * 0.15, 0]}>
          <group position={[0, 0, 0]} rotation={rig.frontLeftLeg}>
            <mesh position={[wingSpan * 0.25, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[wingSpan * 0.5, wingChord, 0.04]} />
              {bodyMaterial(color, useStandard, 0.6, 0.05)}
            </mesh>
          </group>
          <group position={[0, 0, 0]} rotation={rig.frontRightLeg}>
            <mesh position={[-wingSpan * 0.25, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[wingSpan * 0.5, wingChord, 0.04]} />
              {bodyMaterial(color, useStandard, 0.6, 0.05)}
            </mesh>
          </group>
        </group>

        {/* 长尾羽 */}
        <group position={[0, 0, -species.bodyLength * 0.35]} rotation={rig.tail}>
          <mesh position={[0, 0, -tailLen * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[bodyHeight * 0.25, tailLen, 8]} />
            {bodyMaterial(color, useStandard, 0.6, 0.05)}
          </mesh>
        </group>
      </group>

      {/* 2 条立腿（用 rearLeft/Right） */}
      {([
        { rig: rig.rearLeftLeg, pos: [bodyHeight * 0.2, bodyY * 0.7, 0] },
        { rig: rig.rearRightLeg, pos: [-bodyHeight * 0.2, bodyY * 0.7, 0] },
      ] as const).map((leg, idx) => (
        <group key={idx} position={leg.pos as [number, number, number]} rotation={leg.rig}>
          <mesh position={[0, -legLen * 0.5, 0]}>
            <cylinderGeometry args={[bodyHeight * 0.06, bodyHeight * 0.08, legLen, 8]} />
            {bodyMaterial('#d8a020', useStandard, 0.6, 0.05)}
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DragonBody({ species, rig, color, useStandard }: {
  species: CreatureSpeciesSpec;
  rig: CreatureRig;
  color: string;
  useStandard: boolean;
}) {
  // 龙：长躯干分 5 段（蛇形弯曲），4 爪，2 翅，长尾，犄角，胡须
  const bodyY = species.bodyHeight * 0.6;
  const segmentCount = 5;
  const segmentLen = species.bodyLength / segmentCount;
  const bodyRadius = species.bodyHeight * 0.18;
  const legLen = species.bodyHeight * 0.4;
  const wingSpan = species.bodyLength * 0.8;

  return (
    <group>
      <group position={[0, bodyY, 0]} rotation={rig.spine}>
        {/* 蛇形躯干（5 段 cylinder，每段沿 Z 轴排开） */}
        {Array.from({ length: segmentCount }).map((_, i) => {
          const offset = (i - (segmentCount - 1) / 2) * segmentLen;
          const wave = Math.sin(i * 0.6) * 0.06;
          return (
            <mesh key={i} position={[wave, 0, offset]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[bodyRadius * (1 - Math.abs(offset) / species.bodyLength * 0.6), bodyRadius, segmentLen * 1.05, 10]} />
              {bodyMaterial(color, useStandard, 0.5, 0.2)}
            </mesh>
          );
        })}

        {/* 龙头 + 颈 */}
        <group position={[0, bodyRadius * 0.6, species.bodyLength * 0.5]} rotation={rig.neck}>
          <mesh rotation={[Math.PI / 2.5, 0, 0]}>
            <cylinderGeometry args={[bodyRadius * 0.7, bodyRadius, bodyRadius * 1.5, 10]} />
            {bodyMaterial(color, useStandard, 0.5, 0.2)}
          </mesh>
          <mesh position={[0, bodyRadius * 0.6, bodyRadius]}>
            <boxGeometry args={[bodyRadius * 1.2, bodyRadius, bodyRadius * 1.5]} />
            {bodyMaterial(color, useStandard, 0.5, 0.2)}
          </mesh>
          {/* 龙角 */}
          {species.hasHorns && (
            <>
              <mesh position={[bodyRadius * 0.5, bodyRadius * 1.0, bodyRadius * 0.4]} rotation={[-0.3, 0, 0.3]}>
                <coneGeometry args={[0.05, bodyRadius * 1.2, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.4, 0.3)}
              </mesh>
              <mesh position={[-bodyRadius * 0.5, bodyRadius * 1.0, bodyRadius * 0.4]} rotation={[-0.3, 0, -0.3]}>
                <coneGeometry args={[0.05, bodyRadius * 1.2, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.4, 0.3)}
              </mesh>
            </>
          )}
        </group>

        {/* 翅膀 */}
        {species.hasWings && (
          <>
            <group position={[0, bodyRadius * 0.5, 0]} rotation={rig.frontLeftLeg}>
              <mesh position={[wingSpan * 0.25, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <boxGeometry args={[wingSpan * 0.5, species.bodyLength * 0.35, 0.04]} />
                {bodyMaterial(color, useStandard, 0.5, 0.2)}
              </mesh>
            </group>
            <group position={[0, bodyRadius * 0.5, 0]} rotation={rig.frontRightLeg}>
              <mesh position={[-wingSpan * 0.25, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <boxGeometry args={[wingSpan * 0.5, species.bodyLength * 0.35, 0.04]} />
                {bodyMaterial(color, useStandard, 0.5, 0.2)}
              </mesh>
            </group>
          </>
        )}

        {/* 长尾（颜色更深） */}
        <group position={[0, 0, -species.bodyLength * 0.5]} rotation={rig.tail}>
          <mesh position={[0, 0, -species.bodyLength * 0.4]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[bodyRadius * 0.6, species.bodyLength * 0.8, 8]} />
            {bodyMaterial(color, useStandard, 0.5, 0.2)}
          </mesh>
        </group>
      </group>

      {/* 4 爪（独立于 spine） */}
      {([
        { rig: rig.rearLeftLeg, pos: [bodyRadius * 1.2, bodyY * 0.7, -species.bodyLength * 0.15] },
        { rig: rig.rearRightLeg, pos: [-bodyRadius * 1.2, bodyY * 0.7, -species.bodyLength * 0.15] },
      ] as const).map((leg, idx) => (
        <group key={idx} position={leg.pos as [number, number, number]} rotation={leg.rig}>
          <mesh position={[0, -legLen * 0.5, 0]}>
            <cylinderGeometry args={[bodyRadius * 0.3, bodyRadius * 0.4, legLen, 8]} />
            {bodyMaterial(color, useStandard, 0.6, 0.1)}
          </mesh>
        </group>
      ))}
    </group>
  );
}

export const Director3DCreature: React.FC<Director3DCreatureProps> = ({
  actor,
  selected,
  renderMode = 'preview',
  onPointerDown,
}) => {
  const species = useMemo(() => findCreatureSpecies(actor.species), [actor.species]);
  const rig = useMemo<CreatureRig>(
    () => resolveCreatureRig(actor.creatureRig, actor.creatureAction ?? 'idle'),
    [actor.creatureRig, actor.creatureAction],
  );
  const useStandard = renderMode === 'preview';

  const color = useMemo(() => {
    if (renderMode === 'silhouette') {
      return resolveDirector3DColor('var(--token-text-primary)', 'black');
    }
    if (renderMode === 'lineart') {
      return resolveDirector3DColor('var(--token-bg-elevated)', 'white');
    }
    return resolveDirector3DColor(actor.color, species.color);
  }, [actor.color, renderMode, species.color]);

  const ringColors = useMemo(() => ({
    selected: resolveDirector3DColor('var(--token-text-primary)', 'white'),
    idle: resolveDirector3DColor('var(--token-text-muted)', 'gray'),
  }), []);

  // 选择渲染分支
  const body = (() => {
    switch (species.form) {
      case 'avian':
        return <AvianBody species={species} rig={rig} color={color} useStandard={useStandard} />;
      case 'serpent-dragon':
        return <DragonBody species={species} rig={rig} color={color} useStandard={useStandard} />;
      case 'quadruped':
      default:
        return <QuadrupedBody species={species} rig={rig} color={color} useStandard={useStandard} />;
    }
  })();

  return (
    <group
      position={actor.position}
      rotation={[0, actor.rotationY, 0]}
      scale={[actor.scale, actor.scale, actor.scale]}
      onPointerDown={onPointerDown}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[species.bodyLength * 0.25, species.bodyLength * 0.3, 24]} />
        <meshBasicMaterial color={selected ? ringColors.selected : ringColors.idle} transparent opacity={selected ? 0.85 : 0.45} />
      </mesh>
      {body}
      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[species.bodyLength * 0.3, species.bodyLength * 0.36, 32]} />
          <meshBasicMaterial color={ringColors.selected} transparent opacity={0.7} />
        </mesh>
      ) : null}
    </group>
  );
};

export default Director3DCreature;
// 避免 ESLint unused export warning
void CREATURE_ACTION_RIGS;
