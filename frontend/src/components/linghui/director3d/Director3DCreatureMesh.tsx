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
import {
  CreatureEyePair,
  DETAIL,
  bodyMaterial,
  detailColor,
} from './Director3DCreatureParts';
import { QuadrupedBody } from './Director3DQuadrupedBody';

interface Director3DCreatureProps {
  actor: LinghuiDirector3DActor;
  selected?: boolean;
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  onPointerDown?: (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => void;
}

function AvianBody({ species, rig, color, useStandard }: {
  species: CreatureSpeciesSpec;
  rig: CreatureRig;
  color: string;
  useStandard: boolean;
}) {
  const legLen = species.bodyHeight * 0.34;
  const bodyY = legLen + species.bodyHeight * 0.2;
  const bodyHeight = species.bodyHeight * 0.42;
  const bodyLength = species.bodyLength * (species.kind === 'crane' ? 0.52 : 0.68);
  const wingSpan = species.bodyLength * (species.kind === 'crane' ? 1.45 : 1.95);
  const wingChord = species.bodyLength * 0.34;
  const neckLen = species.bodyHeight * (species.kind === 'crane' ? 0.48 : 0.24);
  const headRadius = species.bodyHeight * 0.12;
  const beakLen = species.bodyHeight * (species.kind === 'crane' ? 0.18 : 0.14);
  const tailLen = species.bodyLength * (species.kind === 'phoenix' ? 1.05 : 0.52);
  const eyeColor = detailColor(DETAIL.dark, useStandard ? 'preview' : 'lineart');
  const accentColor = species.kind === 'phoenix' ? detailColor(DETAIL.fire, 'preview') : detailColor(DETAIL.light, 'preview');
  const legColor = detailColor('#d8a020', 'preview');
  const primaryFeatherColor = species.kind === 'phoenix' ? accentColor : color;
  const flightFeatherCount = species.kind === 'phoenix' ? 7 : species.kind === 'crane' ? 6 : 5;

  return (
    <group>
      <group position={[0, bodyY, 0]} rotation={rig.spine}>
        {/* 泪滴状身体：前胸更圆，尾部收窄 */}
        <mesh position={[0, 0, 0]} scale={[0.82, 1.08, 1.28]}>
          <sphereGeometry args={[bodyHeight * 0.42, 18, 12]} />
          {bodyMaterial(color, useStandard, 0.7, 0.05)}
        </mesh>
        <mesh position={[0, -bodyHeight * 0.04, -bodyLength * 0.38]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[bodyHeight * 0.28, bodyLength * 0.58, 10]} />
          {bodyMaterial(color, useStandard, 0.74, 0.04)}
        </mesh>

        <group position={[0, bodyHeight * 0.18, bodyLength * 0.26]} rotation={rig.neck}>
          <mesh position={[0, neckLen * 0.36, neckLen * 0.22]} rotation={[0.45, 0, 0]}>
            <capsuleGeometry args={[bodyHeight * (species.kind === 'crane' ? 0.08 : 0.12), neckLen, 4, 10]} />
            {bodyMaterial(color, useStandard, 0.7, 0.05)}
          </mesh>
          <mesh position={[0, neckLen * 0.82, neckLen * 0.42]}>
            <sphereGeometry args={[headRadius, 16, 12]} />
            {bodyMaterial(color, useStandard, 0.6, 0.05)}
          </mesh>
          <CreatureEyePair
            y={neckLen * 0.86}
            z={neckLen * 0.54}
            spacing={headRadius * 0.45}
            size={headRadius * 0.18}
            useStandard={useStandard}
            color={eyeColor}
          />
          {species.kind === 'crane' ? (
            <mesh position={[0, neckLen * 1.0, neckLen * 0.35]}>
              <sphereGeometry args={[headRadius * 0.36, 10, 8]} />
              {bodyMaterial(detailColor(DETAIL.red, 'preview'), useStandard, 0.45, 0.05)}
            </mesh>
          ) : null}
          <mesh position={[0, neckLen * 0.8, neckLen * 0.42 + headRadius + beakLen * 0.45]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[headRadius * 0.46, beakLen, 7]} />
            {bodyMaterial(legColor, useStandard, 0.4, 0.1)}
          </mesh>
        </group>

        <group position={[0, bodyHeight * 0.08, bodyLength * 0.02]}>
          <group rotation={rig.frontLeftLeg}>
            <mesh position={[wingSpan * 0.18, 0, -wingChord * 0.02]} rotation={[Math.PI / 2, 0, -0.16]}>
              <boxGeometry args={[wingSpan * 0.36, wingChord * 0.3, 0.035]} />
              {bodyMaterial(color, useStandard, 0.6, 0.05)}
            </mesh>
            {Array.from({ length: flightFeatherCount }).map((_, i) => {
              const t = i / Math.max(1, flightFeatherCount - 1);
              return (
                <mesh
                  key={`left-feather-${i}`}
                  position={[wingSpan * (0.18 + t * 0.34), -wingChord * (0.1 + t * 0.36), -wingChord * (0.03 + t * 0.06)]}
                  rotation={[Math.PI / 2, 0, -0.3 + t * 0.18]}
                >
                  <coneGeometry args={[wingChord * (0.11 - t * 0.025), wingChord * (0.5 + t * 0.18), 7]} />
                  {bodyMaterial(primaryFeatherColor, useStandard, 0.68, 0.04)}
                </mesh>
              );
            })}
          </group>
          <group rotation={rig.frontRightLeg}>
            <mesh position={[-wingSpan * 0.18, 0, -wingChord * 0.02]} rotation={[Math.PI / 2, 0, 0.16]}>
              <boxGeometry args={[wingSpan * 0.36, wingChord * 0.3, 0.035]} />
              {bodyMaterial(color, useStandard, 0.6, 0.05)}
            </mesh>
            {Array.from({ length: flightFeatherCount }).map((_, i) => {
              const t = i / Math.max(1, flightFeatherCount - 1);
              return (
                <mesh
                  key={`right-feather-${i}`}
                  position={[-wingSpan * (0.18 + t * 0.34), -wingChord * (0.1 + t * 0.36), -wingChord * (0.03 + t * 0.06)]}
                  rotation={[Math.PI / 2, 0, 0.3 - t * 0.18]}
                >
                  <coneGeometry args={[wingChord * (0.11 - t * 0.025), wingChord * (0.5 + t * 0.18), 7]} />
                  {bodyMaterial(primaryFeatherColor, useStandard, 0.68, 0.04)}
                </mesh>
              );
            })}
          </group>
        </group>

        <group position={[0, -bodyHeight * 0.03, -bodyLength * 0.54]} rotation={rig.tail}>
          {Array.from({ length: species.kind === 'phoenix' ? 5 : 3 }).map((_, i) => {
            const center = (i - (species.kind === 'phoenix' ? 2 : 1)) * bodyHeight * 0.11;
            return (
              <mesh key={`tail-feather-${i}`} position={[center, -bodyHeight * 0.05, -tailLen * 0.42]} rotation={[Math.PI / 2, 0, center * 0.22]}>
                <coneGeometry args={[bodyHeight * 0.08, tailLen * (species.kind === 'phoenix' ? 0.9 : 0.48), 7]} />
                {bodyMaterial(species.kind === 'phoenix' ? accentColor : color, useStandard, 0.65, 0.04)}
              </mesh>
            );
          })}
        </group>
      </group>

      {/* 2 条立腿（用 rearLeft/Right） */}
      {([
        { rig: rig.rearLeftLeg, pos: [bodyHeight * 0.18, legLen, 0] },
        { rig: rig.rearRightLeg, pos: [-bodyHeight * 0.18, legLen, 0] },
      ] as const).map((leg, idx) => (
        <group key={idx} position={leg.pos as [number, number, number]} rotation={leg.rig}>
          <mesh position={[0, -legLen * 0.5, 0]}>
            <capsuleGeometry args={[bodyHeight * 0.055, legLen, 4, 8]} />
            {bodyMaterial(legColor, useStandard, 0.6, 0.05)}
          </mesh>
          <mesh position={[0, -legLen, bodyHeight * 0.1]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[bodyHeight * 0.045, bodyHeight * 0.12, 7]} />
            {bodyMaterial(detailColor(DETAIL.claw, 'preview'), useStandard, 0.42, 0.12)}
          </mesh>
          {([-1, 1] as const).map(toe => (
            <mesh
              key={`avian-side-toe-${toe}`}
              position={[toe * bodyHeight * 0.055, -legLen - bodyHeight * 0.01, bodyHeight * 0.04]}
              rotation={[Math.PI / 2, 0, toe * 0.54]}
            >
              <coneGeometry args={[bodyHeight * 0.028, bodyHeight * 0.11, 6]} />
              {bodyMaterial(detailColor(DETAIL.claw, 'preview'), useStandard, 0.42, 0.12)}
            </mesh>
          ))}
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
  const bodyY = species.bodyHeight * 0.72;
  const segmentCount = 5;
  const segmentLen = species.bodyLength / segmentCount;
  const bodyRadius = species.bodyHeight * 0.18;
  const legLen = species.bodyHeight * 0.42;
  const wingSpan = species.bodyLength * 0.8;
  const scaleColor = detailColor(DETAIL.gold, 'preview');
  const eyeColor = detailColor(DETAIL.dark, useStandard ? 'preview' : 'lineart');
  const whiskerColor = detailColor(DETAIL.light, 'preview');

  return (
    <group>
      <group position={[0, bodyY, 0]} rotation={rig.spine}>
        {/* 蛇形躯干（5 段 cylinder，每段沿 Z 轴排开） */}
        {Array.from({ length: segmentCount }).map((_, i) => {
          const offset = (i - (segmentCount - 1) / 2) * segmentLen;
          const wave = Math.sin(i * 0.6) * 0.06;
          return (
            <React.Fragment key={`dragon-segment-${i}`}>
              <mesh position={[wave, 0, offset]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bodyRadius * (1 - Math.abs(offset) / species.bodyLength * 0.6), bodyRadius, segmentLen * 1.05, 10]} />
                {bodyMaterial(color, useStandard, 0.5, 0.2)}
              </mesh>
              <mesh position={[wave, bodyRadius * 0.68, offset]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[bodyRadius * 0.32, bodyRadius * 0.38, 6]} />
                {bodyMaterial(scaleColor, useStandard, 0.48, 0.18)}
              </mesh>
            </React.Fragment>
          );
        })}

        {/* 龙头 + 颈 */}
        <group position={[0, bodyRadius * 0.1, species.bodyLength * 0.48]} rotation={rig.neck}>
          <mesh position={[0, bodyRadius * 0.18, bodyRadius * 0.65]} rotation={[Math.PI / 2.35, 0, 0]}>
            <capsuleGeometry args={[bodyRadius * 0.48, bodyRadius * 1.25, 4, 10]} />
            {bodyMaterial(color, useStandard, 0.5, 0.2)}
          </mesh>
          <mesh position={[0, bodyRadius * 0.28, bodyRadius * 1.35]} scale={[1.2, 0.72, 1.45]}>
            <sphereGeometry args={[bodyRadius * 0.78, 16, 12]} />
            {bodyMaterial(color, useStandard, 0.5, 0.2)}
          </mesh>
          <mesh position={[0, bodyRadius * 0.14, bodyRadius * 2.02]} scale={[1.05, 0.52, 0.9]}>
            <boxGeometry args={[bodyRadius * 0.82, bodyRadius * 0.38, bodyRadius * 0.72]} />
            {bodyMaterial(color, useStandard, 0.55, 0.16)}
          </mesh>
          <CreatureEyePair
            y={bodyRadius * 0.42}
            z={bodyRadius * 1.94}
            spacing={bodyRadius * 0.34}
            size={bodyRadius * 0.09}
            useStandard={useStandard}
            color={eyeColor}
          />
          {([-1, 1] as const).flatMap(sign => ([-1, 1] as const).map(row => (
            <mesh key={`whisker-${sign}-${row}`} position={[sign * bodyRadius * 0.55, bodyRadius * (0.12 + row * 0.08), bodyRadius * 2.12]} rotation={[Math.PI / 2, 0, sign * (0.58 + row * 0.14)]}>
              <cylinderGeometry args={[bodyRadius * 0.025, bodyRadius * 0.025, bodyRadius * 1.45, 6]} />
              {bodyMaterial(whiskerColor, useStandard, 0.55, 0.05)}
            </mesh>
          )))}
          {/* 龙角 */}
          {species.hasHorns && (
            <>
              <mesh position={[bodyRadius * 0.5, bodyRadius * 0.9, bodyRadius * 1.0]} rotation={[-0.3, 0, 0.3]}>
                <coneGeometry args={[0.05, bodyRadius * 1.2, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.4, 0.3)}
              </mesh>
              <mesh position={[-bodyRadius * 0.5, bodyRadius * 0.9, bodyRadius * 1.0]} rotation={[-0.3, 0, -0.3]}>
                <coneGeometry args={[0.05, bodyRadius * 1.2, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.4, 0.3)}
              </mesh>
              {([-1, 1] as const).flatMap(sign => ([0.34, 0.62] as const).map((height, i) => (
                <mesh
                  key={`dragon-antler-branch-${sign}-${i}`}
                  position={[sign * bodyRadius * (0.54 + i * 0.04), bodyRadius * (0.82 + height), bodyRadius * 0.96]}
                  rotation={[-0.08, 0, sign * (0.78 + i * 0.16)]}
                >
                  <coneGeometry args={[bodyRadius * 0.045, bodyRadius * 0.5, 6]} />
                  {bodyMaterial('#d4b878', useStandard, 0.42, 0.24)}
                </mesh>
              )))}
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
              {Array.from({ length: 4 }).map((_, i) => (
                <mesh key={`dragon-wing-left-${i}`} position={[wingSpan * (0.08 + i * 0.09), -species.bodyLength * 0.08, 0]} rotation={[Math.PI / 2, 0, -0.12]}>
                  <coneGeometry args={[bodyRadius * 0.18, species.bodyLength * 0.22, 6]} />
                  {bodyMaterial(scaleColor, useStandard, 0.5, 0.18)}
                </mesh>
              ))}
            </group>
            <group position={[0, bodyRadius * 0.5, 0]} rotation={rig.frontRightLeg}>
              <mesh position={[-wingSpan * 0.25, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <boxGeometry args={[wingSpan * 0.5, species.bodyLength * 0.35, 0.04]} />
                {bodyMaterial(color, useStandard, 0.5, 0.2)}
              </mesh>
              {Array.from({ length: 4 }).map((_, i) => (
                <mesh key={`dragon-wing-right-${i}`} position={[-wingSpan * (0.08 + i * 0.09), -species.bodyLength * 0.08, 0]} rotation={[Math.PI / 2, 0, 0.12]}>
                  <coneGeometry args={[bodyRadius * 0.18, species.bodyLength * 0.22, 6]} />
                  {bodyMaterial(scaleColor, useStandard, 0.5, 0.18)}
                </mesh>
              ))}
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

      {/* 4 爪（独立于 spine，但加肩/胯连接球维持读形） */}
      {([
        { rig: rig.frontLeftLeg, pos: [bodyRadius * 1.1, bodyY - bodyRadius * 0.2, species.bodyLength * 0.24] },
        { rig: rig.frontRightLeg, pos: [-bodyRadius * 1.1, bodyY - bodyRadius * 0.2, species.bodyLength * 0.24] },
        { rig: rig.rearLeftLeg, pos: [bodyRadius * 1.15, bodyY - bodyRadius * 0.12, -species.bodyLength * 0.2] },
        { rig: rig.rearRightLeg, pos: [-bodyRadius * 1.15, bodyY - bodyRadius * 0.12, -species.bodyLength * 0.2] },
      ] as const).map((leg, idx) => (
        <group key={idx} position={leg.pos as [number, number, number]} rotation={leg.rig}>
          <mesh position={[0, bodyRadius * 0.1, 0]}>
            <sphereGeometry args={[bodyRadius * 0.36, 10, 8]} />
            {bodyMaterial(color, useStandard, 0.56, 0.12)}
          </mesh>
          <mesh position={[0, -legLen * 0.5, 0]}>
            <cylinderGeometry args={[bodyRadius * 0.3, bodyRadius * 0.4, legLen, 8]} />
            {bodyMaterial(color, useStandard, 0.6, 0.1)}
          </mesh>
          {([-1, 0, 1] as const).map(toe => (
            <mesh key={`dragon-claw-${toe}`} position={[toe * bodyRadius * 0.18, -legLen - bodyRadius * 0.06, bodyRadius * 0.35]} rotation={[Math.PI / 2, 0, toe * 0.18]}>
              <coneGeometry args={[bodyRadius * 0.08, bodyRadius * 0.28, 6]} />
              {bodyMaterial(detailColor(DETAIL.claw, 'preview'), useStandard, 0.42, 0.18)}
            </mesh>
          ))}
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
