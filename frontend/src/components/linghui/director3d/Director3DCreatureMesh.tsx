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

const HASH = String.fromCharCode(35);
const DETAIL = {
  dark: `${HASH}17181d`,
  light: `${HASH}f7f1df`,
  stripe: `${HASH}211713`,
  claw: `${HASH}efe2c6`,
  gold: `${HASH}d4b878`,
  fire: `${HASH}ffb238`,
  red: `${HASH}c63224`,
};

function detailColor(value: string, renderMode: 'preview' | 'lineart' | 'silhouette', fallback = value): string {
  if (renderMode === 'silhouette') return resolveDirector3DColor('var(--token-text-primary)', 'black');
  if (renderMode === 'lineart') return resolveDirector3DColor('var(--token-text-primary)', 'black');
  return resolveDirector3DColor(value, fallback);
}

function CreatureEyePair({ y, z, spacing, size, useStandard, color }: {
  y: number;
  z: number;
  spacing: number;
  size: number;
  useStandard: boolean;
  color: string;
}) {
  return (
    <>
      {([-1, 1] as const).map(sign => (
        <mesh key={`eye-${sign}`} position={[sign * spacing, y, z]}>
          <sphereGeometry args={[size, 10, 8]} />
          {bodyMaterial(color, useStandard, 0.35, 0.05)}
        </mesh>
      ))}
    </>
  );
}

function CreatureEarPair({ y, z, spacing, size, useStandard, color, floppy = false }: {
  y: number;
  z: number;
  spacing: number;
  size: number;
  useStandard: boolean;
  color: string;
  floppy?: boolean;
}) {
  return (
    <>
      {([-1, 1] as const).map(sign => (
        <mesh
          key={`ear-${sign}`}
          position={[sign * spacing, y, z]}
          rotation={[floppy ? 0.25 : -0.18, 0, sign * (floppy ? 0.62 : 0.32)]}
        >
          <coneGeometry args={[size * 0.5, size, 8]} />
          {bodyMaterial(color, useStandard, 0.7, 0.05)}
        </mesh>
      ))}
    </>
  );
}

function StripeSet({ count, bodyWidth, bodyHeight, bodyLength, color, useStandard }: {
  count: number;
  bodyWidth: number;
  bodyHeight: number;
  bodyLength: number;
  color: string;
  useStandard: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const z = -bodyLength * 0.26 + t * bodyLength * 0.52;
        const lean = i % 2 === 0 ? 0.24 : -0.24;
        return (
          <mesh key={`stripe-${i}`} position={[0, bodyHeight * 0.12, z]} rotation={[0, 0, lean]}>
            <boxGeometry args={[bodyWidth * 1.08, bodyHeight * 0.08, bodyLength * 0.028]} />
            {bodyMaterial(color, useStandard, 0.8, 0.02)}
          </mesh>
        );
      })}
    </>
  );
}

function SpotSet({ count, bodyWidth, bodyHeight, bodyLength, color, useStandard }: {
  count: number;
  bodyWidth: number;
  bodyHeight: number;
  bodyLength: number;
  color: string;
  useStandard: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        const row = Math.floor(i / 2);
        const z = -bodyLength * 0.24 + row * bodyLength * 0.12;
        return (
          <mesh key={`spot-${i}`} position={[side * bodyWidth * 0.51, bodyHeight * (0.08 + (row % 2) * 0.12), z]} scale={[1, 0.68, 0.24]}>
            <sphereGeometry args={[bodyHeight * 0.07, 10, 8]} />
            {bodyMaterial(color, useStandard, 0.75, 0.02)}
          </mesh>
        );
      })}
    </>
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
  const detailInk = detailColor(DETAIL.dark, useStandard ? 'preview' : 'lineart');
  const stripeColor = detailColor(DETAIL.stripe, useStandard ? 'preview' : 'lineart');
  const clawColor = detailColor(DETAIL.claw, useStandard ? 'preview' : 'lineart');

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

        {species.kind === 'tiger' ? (
          <StripeSet count={7} bodyWidth={bodyWidth} bodyHeight={bodyHeight} bodyLength={species.bodyLength} color={stripeColor} useStandard={useStandard} />
        ) : null}
        {species.kind === 'deer' ? (
          <SpotSet count={8} bodyWidth={bodyWidth} bodyHeight={bodyHeight} bodyLength={species.bodyLength} color={detailColor(DETAIL.light, 'preview')} useStandard={useStandard} />
        ) : null}
        {species.kind === 'qilin' ? (
          <StripeSet count={5} bodyWidth={bodyWidth * 0.92} bodyHeight={bodyHeight} bodyLength={species.bodyLength} color={detailColor(DETAIL.gold, 'preview')} useStandard={useStandard} />
        ) : null}

        {/* 鬣毛（lion / qilin / horse） */}
        {species.hasMane && (
          <group position={[0, bodyHeight * 0.42, frontZ * 0.54]}>
            <mesh>
              <sphereGeometry args={[bodyWidth * 0.68, 16, 12]} />
              {bodyMaterial(species.kind === 'horse' ? '#4a3020' : '#8a5a30', useStandard, 0.9, 0)}
            </mesh>
            {Array.from({ length: species.kind === 'horse' ? 5 : 9 }).map((_, i) => (
              <mesh
                key={`mane-lock-${i}`}
                position={[0, bodyHeight * (0.24 - i * 0.035), -bodyWidth * 0.15 + i * bodyWidth * 0.05]}
                rotation={[0.2, 0, (i % 2 === 0 ? 1 : -1) * 0.12]}
              >
                <coneGeometry args={[bodyWidth * 0.08, bodyHeight * 0.18, 7]} />
                {bodyMaterial(species.kind === 'horse' ? '#4a3020' : '#8a5a30', useStandard, 0.9, 0)}
              </mesh>
            ))}
          </group>
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
          <CreatureEyePair
            y={neckLength * 0.95}
            z={neckLength * 1.34}
            spacing={headSize * 0.28}
            size={headSize * 0.08}
            useStandard={useStandard}
            color={detailInk}
          />
          <mesh position={[0, neckLength * 0.78, neckLength * 1.48]} scale={[1, 0.62, 0.32]}>
            <sphereGeometry args={[headSize * 0.16, 10, 8]} />
            {bodyMaterial(detailInk, useStandard, 0.55, 0.04)}
          </mesh>
          <CreatureEarPair
            y={neckLength + headSize * 0.33}
            z={neckLength * 0.72}
            spacing={headSize * 0.43}
            size={headSize * (species.kind === 'bear' ? 0.38 : 0.55)}
            useStandard={useStandard}
            color={color}
            floppy={species.kind === 'bear' || species.kind === 'horse'}
          />
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
          {(species.kind === 'fox' ? [0, 1, 2] : [0]).map((_, i) => (
            <mesh
              key={`tail-tip-${i}`}
              position={[(i - 1) * tailRadius * 1.8, tailRadius * (species.kind === 'fox' ? 0.7 : 0.15), -tailLength * 0.95]}
              rotation={[Math.PI / 2, 0, (i - 1) * 0.25]}
            >
              <coneGeometry args={[tailRadius * (species.kind === 'fox' ? 1.8 : 0.9), tailLength * 0.28, 10]} />
              {bodyMaterial(species.kind === 'fox' ? detailColor(DETAIL.light, 'preview') : color, useStandard, 0.75, 0.03)}
            </mesh>
          ))}
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
          <mesh position={[0, -legLen - legRadius * 0.28, legRadius * 1.4]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[legRadius * (species.kind === 'bear' ? 1.05 : 0.72), legRadius * 1.5, 8]} />
            {bodyMaterial(clawColor, useStandard, 0.42, 0.12)}
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
  const eyeColor = detailColor(DETAIL.dark, useStandard ? 'preview' : 'lineart');
  const accentColor = species.kind === 'phoenix' ? detailColor(DETAIL.fire, 'preview') : detailColor(DETAIL.light, 'preview');
  const legColor = detailColor('#d8a020', 'preview');

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
          <CreatureEyePair
            y={bodyHeight * 0.43}
            z={bodyHeight * 0.36}
            spacing={bodyHeight * 0.1}
            size={bodyHeight * 0.035}
            useStandard={useStandard}
            color={eyeColor}
          />
          {species.kind === 'crane' ? (
            <mesh position={[0, bodyHeight * 0.58, bodyHeight * 0.22]}>
              <sphereGeometry args={[bodyHeight * 0.07, 10, 8]} />
              {bodyMaterial(detailColor(DETAIL.red, 'preview'), useStandard, 0.45, 0.05)}
            </mesh>
          ) : null}
          {/* 喙 */}
          <mesh position={[0, bodyHeight * 0.35, bodyHeight * 0.32]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[bodyHeight * 0.08, beakLen, 6]} />
            {bodyMaterial(legColor, useStandard, 0.4, 0.1)}
          </mesh>
        </group>

        {/* 翅膀（frontLeft/Right 当翼根用） */}
        <group position={[0, bodyHeight * 0.15, 0]}>
          <group position={[0, 0, 0]} rotation={rig.frontLeftLeg}>
            <mesh position={[wingSpan * 0.25, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[wingSpan * 0.5, wingChord, 0.04]} />
              {bodyMaterial(color, useStandard, 0.6, 0.05)}
            </mesh>
            {Array.from({ length: 5 }).map((_, i) => (
              <mesh
                key={`left-feather-${i}`}
                position={[wingSpan * (0.08 + i * 0.08), -wingChord * 0.38, 0]}
                rotation={[Math.PI / 2, 0, -0.12]}
              >
                <coneGeometry args={[wingChord * 0.1, wingChord * 0.42, 7]} />
                {bodyMaterial(species.kind === 'phoenix' ? accentColor : color, useStandard, 0.68, 0.04)}
              </mesh>
            ))}
          </group>
          <group position={[0, 0, 0]} rotation={rig.frontRightLeg}>
            <mesh position={[-wingSpan * 0.25, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[wingSpan * 0.5, wingChord, 0.04]} />
              {bodyMaterial(color, useStandard, 0.6, 0.05)}
            </mesh>
            {Array.from({ length: 5 }).map((_, i) => (
              <mesh
                key={`right-feather-${i}`}
                position={[-wingSpan * (0.08 + i * 0.08), -wingChord * 0.38, 0]}
                rotation={[Math.PI / 2, 0, 0.12]}
              >
                <coneGeometry args={[wingChord * 0.1, wingChord * 0.42, 7]} />
                {bodyMaterial(species.kind === 'phoenix' ? accentColor : color, useStandard, 0.68, 0.04)}
              </mesh>
            ))}
          </group>
        </group>

        {/* 长尾羽 */}
        <group position={[0, 0, -species.bodyLength * 0.35]} rotation={rig.tail}>
          <mesh position={[0, 0, -tailLen * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[bodyHeight * 0.25, tailLen, 8]} />
            {bodyMaterial(color, useStandard, 0.6, 0.05)}
          </mesh>
          {Array.from({ length: species.kind === 'phoenix' ? 5 : 3 }).map((_, i) => {
            const center = (i - (species.kind === 'phoenix' ? 2 : 1)) * bodyHeight * 0.11;
            return (
              <mesh key={`tail-feather-${i}`} position={[center, -bodyHeight * 0.05, -tailLen * 0.72]} rotation={[Math.PI / 2, 0, center * 0.22]}>
                <coneGeometry args={[bodyHeight * 0.08, tailLen * (species.kind === 'phoenix' ? 0.9 : 0.48), 7]} />
                {bodyMaterial(species.kind === 'phoenix' ? accentColor : color, useStandard, 0.65, 0.04)}
              </mesh>
            );
          })}
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
            {bodyMaterial(legColor, useStandard, 0.6, 0.05)}
          </mesh>
          <mesh position={[0, -legLen - bodyHeight * 0.02, bodyHeight * 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[bodyHeight * 0.045, bodyHeight * 0.12, 7]} />
            {bodyMaterial(detailColor(DETAIL.claw, 'preview'), useStandard, 0.42, 0.12)}
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
        <group position={[0, bodyRadius * 0.6, species.bodyLength * 0.5]} rotation={rig.neck}>
          <mesh rotation={[Math.PI / 2.5, 0, 0]}>
            <cylinderGeometry args={[bodyRadius * 0.7, bodyRadius, bodyRadius * 1.5, 10]} />
            {bodyMaterial(color, useStandard, 0.5, 0.2)}
          </mesh>
          <mesh position={[0, bodyRadius * 0.6, bodyRadius]}>
            <boxGeometry args={[bodyRadius * 1.2, bodyRadius, bodyRadius * 1.5]} />
            {bodyMaterial(color, useStandard, 0.5, 0.2)}
          </mesh>
          <CreatureEyePair
            y={bodyRadius * 0.76}
            z={bodyRadius * 1.82}
            spacing={bodyRadius * 0.34}
            size={bodyRadius * 0.09}
            useStandard={useStandard}
            color={eyeColor}
          />
          {([-1, 1] as const).map(sign => (
            <mesh key={`whisker-${sign}`} position={[sign * bodyRadius * 0.55, bodyRadius * 0.38, bodyRadius * 1.92]} rotation={[Math.PI / 2, 0, sign * 0.6]}>
              <cylinderGeometry args={[bodyRadius * 0.025, bodyRadius * 0.025, bodyRadius * 1.45, 6]} />
              {bodyMaterial(whiskerColor, useStandard, 0.55, 0.05)}
            </mesh>
          ))}
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
