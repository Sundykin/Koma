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

function WhiskerSet({ headSize, y, z, color, useStandard }: {
  headSize: number;
  y: number;
  z: number;
  color: string;
  useStandard: boolean;
}) {
  return (
    <>
      {([-1, 1] as const).flatMap(sign => ([-1, 1] as const).map((row) => (
        <mesh
          key={`whisker-${sign}-${row}`}
          position={[sign * headSize * 0.42, y + row * headSize * 0.04, z]}
          rotation={[Math.PI / 2, 0, sign * 0.92]}
        >
          <cylinderGeometry args={[headSize * 0.012, headSize * 0.012, headSize * 0.64, 6]} />
          {bodyMaterial(color, useStandard, 0.55, 0.04)}
        </mesh>
      )))}
    </>
  );
}

function AntlerBranch({ side, headSize, neckLength, useStandard }: {
  side: -1 | 1;
  headSize: number;
  neckLength: number;
  useStandard: boolean;
}) {
  const hornColor = detailColor(DETAIL.gold, useStandard ? 'preview' : 'lineart');
  return (
    <group position={[side * headSize * 0.35, neckLength * 0.68, neckLength * 0.78]} rotation={[-0.38, 0, side * 0.22]}>
      <mesh rotation={[0.12, 0, side * 0.2]}>
        <cylinderGeometry args={[headSize * 0.035, headSize * 0.065, headSize * 1.22, 6]} />
        {bodyMaterial(hornColor, useStandard, 0.48, 0.2)}
      </mesh>
      {[0.34, 0.62].map((offset, i) => (
        <mesh
          key={`branch-${i}`}
          position={[side * headSize * (0.08 + i * 0.04), headSize * offset, 0]}
          rotation={[0.46, 0, side * (0.68 + i * 0.18)]}
        >
          <cylinderGeometry args={[headSize * 0.018, headSize * 0.032, headSize * 0.42, 6]} />
          {bodyMaterial(hornColor, useStandard, 0.48, 0.2)}
        </mesh>
      ))}
    </group>
  );
}

function QuadrupedFoot({ species, legRadius, footZ, clawColor, useStandard, color }: {
  species: CreatureSpeciesSpec;
  legRadius: number;
  footZ: number;
  clawColor: string;
  useStandard: boolean;
  color: string;
}) {
  if (species.kind === 'horse' || species.kind === 'deer' || species.kind === 'qilin') {
    return (
      <>
        <mesh position={[0, -legRadius * 0.14, 0]}>
          <cylinderGeometry args={[legRadius * 0.9, legRadius * 1.06, legRadius * 1.4, 8]} />
          {bodyMaterial(color, useStandard, 0.7, 0.05)}
        </mesh>
        <mesh position={[0, -legRadius * 1.0, footZ + legRadius * 0.5]} scale={[1.05, 0.42, 1.3]}>
          <boxGeometry args={[legRadius * 1.85, legRadius * 0.74, legRadius * 1.5]} />
          {bodyMaterial(detailColor(DETAIL.dark, useStandard ? 'preview' : 'lineart'), useStandard, 0.48, 0.12)}
        </mesh>
      </>
    );
  }

  const toeOffsets = species.kind === 'bear' ? [-0.7, 0, 0.7] : [-0.48, 0.48];
  return (
    <>
      <mesh position={[0, 0, footZ]} scale={[1.35, species.kind === 'bear' ? 0.55 : 0.45, species.kind === 'bear' ? 2.05 : 1.8]}>
        <sphereGeometry args={[legRadius * (species.kind === 'bear' ? 1.45 : 1.05), 10, 8]} />
        {bodyMaterial(color, useStandard, 0.75, 0.05)}
      </mesh>
      {toeOffsets.map((toe) => (
        <mesh key={`toe-${toe}`} position={[toe * legRadius, -legRadius * 0.12, footZ + legRadius * 1.16]} rotation={[Math.PI / 2, 0, toe * 0.18]}>
          <coneGeometry args={[legRadius * (species.kind === 'bear' ? 0.64 : 0.46), legRadius * 1.15, 8]} />
          {bodyMaterial(clawColor, useStandard, 0.42, 0.12)}
        </mesh>
      ))}
    </>
  );
}

function QuadrupedBody({ species, rig, color, useStandard }: {
  species: CreatureSpeciesSpec;
  rig: CreatureRig;
  color: string;
  useStandard: boolean;
}) {
  const legLen = species.bodyHeight * (species.kind === 'bear' ? 0.36 : species.kind === 'horse' || species.kind === 'deer' || species.kind === 'qilin' ? 0.58 : 0.46);
  const shoulderY = legLen;
  const bodyLength = species.bodyLength * (species.kind === 'bear' ? 0.72 : 0.78);
  const bodyWidth = species.bodyLength * (species.kind === 'bear' ? 0.34 : species.kind === 'horse' ? 0.22 : 0.26);
  const bodyHeight = species.bodyHeight * (species.kind === 'bear' ? 0.36 : 0.3);
  const chestY = shoulderY + bodyHeight * 0.18;
  const hipY = shoulderY - bodyHeight * 0.03;
  const legRadius = bodyWidth * (species.kind === 'bear' ? 0.17 : 0.12);
  const frontZ = bodyLength * 0.36;
  const rearZ = -bodyLength * 0.34;
  const sideX = bodyWidth * 0.42;
  const neckLength = species.bodyHeight * (species.kind === 'horse' || species.kind === 'deer' || species.kind === 'qilin' ? 0.38 : species.kind === 'bear' ? 0.18 : 0.24);
  const headSize = species.bodyHeight * (species.kind === 'bear' ? 0.2 : species.kind === 'horse' ? 0.17 : 0.16);
  const muzzleLength = headSize * (species.kind === 'horse' || species.kind === 'deer' ? 1.35 : species.kind === 'wolf' || species.kind === 'fox' ? 1.22 : species.kind === 'bear' ? 0.75 : 0.88);
  const tailLength = species.bodyLength * (species.kind === 'horse' ? 0.48 : species.kind === 'fox' ? 0.62 : 0.38);
  const tailRadius = Math.max(0.025, bodyWidth * 0.08);
  const detailInk = detailColor(DETAIL.dark, useStandard ? 'preview' : 'lineart');
  const stripeColor = detailColor(DETAIL.stripe, useStandard ? 'preview' : 'lineart');
  const clawColor = detailColor(DETAIL.claw, useStandard ? 'preview' : 'lineart');
  const maneColor = species.kind === 'horse' ? '#4a3020' : species.kind === 'qilin' ? '#c84525' : '#7a4a23';
  const footZ = species.kind === 'bear' ? 0.12 : 0.08;
  const isAntlered = species.kind === 'deer' || species.kind === 'qilin';

  return (
    <group>
      <group position={[0, shoulderY, 0]} rotation={rig.spine}>
        {/* 躯干由胸腔和胯部两段叠成，避免一块盒子看起来像积木 */}
        <mesh position={[0, bodyHeight * 0.08, bodyLength * 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[bodyWidth * 0.46, bodyLength * 0.5, 5, 12]} />
          {bodyMaterial(color, useStandard, 0.78, 0.04)}
        </mesh>
        <mesh position={[0, -bodyHeight * 0.02, -bodyLength * 0.23]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[bodyWidth * (species.kind === 'bear' ? 0.58 : 0.42), bodyLength * 0.35, 5, 12]} />
          {bodyMaterial(color, useStandard, 0.78, 0.04)}
        </mesh>

        {species.kind === 'tiger' ? (
          <StripeSet count={8} bodyWidth={bodyWidth * 0.95} bodyHeight={bodyHeight} bodyLength={bodyLength} color={stripeColor} useStandard={useStandard} />
        ) : null}
        {species.kind === 'deer' ? (
          <SpotSet count={10} bodyWidth={bodyWidth * 0.9} bodyHeight={bodyHeight} bodyLength={bodyLength} color={detailColor(DETAIL.light, 'preview')} useStandard={useStandard} />
        ) : null}
        {species.kind === 'qilin' ? (
          <StripeSet count={6} bodyWidth={bodyWidth * 0.85} bodyHeight={bodyHeight} bodyLength={bodyLength} color={detailColor(DETAIL.gold, 'preview')} useStandard={useStandard} />
        ) : null}

        {/* 鬣毛沿颈背向前，不再漂在身体上方 */}
        {species.hasMane && (
          <group position={[0, bodyHeight * 0.34, frontZ - bodyLength * 0.08]}>
            {Array.from({ length: species.kind === 'horse' ? 7 : 10 }).map((_, i) => (
              <mesh
                key={`mane-lock-${i}`}
                position={[0, -i * bodyHeight * 0.035, -i * bodyLength * 0.035]}
                rotation={[0.95, 0, (i % 2 === 0 ? 1 : -1) * 0.08]}
              >
                <coneGeometry args={[bodyWidth * 0.08, bodyHeight * 0.24, 7]} />
                {bodyMaterial(maneColor, useStandard, 0.9, 0)}
              </mesh>
            ))}
          </group>
        )}

        {/* 颈 + 头：从胸前水平前伸，避免头飞到身体上方 */}
        <group position={[0, bodyHeight * 0.2, frontZ]} rotation={rig.neck}>
          <mesh position={[0, neckLength * 0.12, neckLength * 0.45]} rotation={[Math.PI / 2.25, 0, 0]}>
            <capsuleGeometry args={[headSize * 0.35, neckLength * 0.65, 4, 10]} />
            {bodyMaterial(color, useStandard, 0.7, 0.05)}
          </mesh>
          <mesh position={[0, neckLength * 0.18, neckLength * 0.88]} scale={[1, 0.82, 1.08]}>
            <sphereGeometry args={[headSize * 0.78, 16, 12]} />
            {bodyMaterial(color, useStandard, 0.6, 0.05)}
          </mesh>
          <mesh position={[0, neckLength * 0.05, neckLength * 1.25]} scale={[0.85, 0.55, 1]}>
            <boxGeometry args={[headSize * 0.9, headSize * 0.55, muzzleLength]} />
            {bodyMaterial(color, useStandard, 0.66, 0.04)}
          </mesh>
          {(species.kind === 'lion' || species.kind === 'tiger' || species.kind === 'wolf' || species.kind === 'fox') ? (
            <WhiskerSet
              headSize={headSize}
              y={neckLength * 0.04}
              z={neckLength * 1.28 + muzzleLength * 0.36}
              color={detailInk}
              useStandard={useStandard}
            />
          ) : null}
          <CreatureEyePair
            y={neckLength * 0.28}
            z={neckLength * 1.14}
            spacing={headSize * 0.28}
            size={headSize * 0.065}
            useStandard={useStandard}
            color={detailInk}
          />
          <mesh position={[0, neckLength * 0.03, neckLength * 1.25 + muzzleLength * 0.52]} scale={[1, 0.6, 0.3]}>
            <sphereGeometry args={[headSize * 0.14, 10, 8]} />
            {bodyMaterial(detailInk, useStandard, 0.55, 0.04)}
          </mesh>
          <CreatureEarPair
            y={neckLength * 0.58}
            z={neckLength * 0.8}
            spacing={headSize * 0.43}
            size={headSize * (species.kind === 'bear' ? 0.34 : species.kind === 'horse' ? 0.46 : 0.62)}
            useStandard={useStandard}
            color={color}
            floppy={species.kind === 'bear' || species.kind === 'horse'}
          />
          {isAntlered ? (
            <>
              <AntlerBranch side={1} headSize={headSize} neckLength={neckLength} useStandard={useStandard} />
              <AntlerBranch side={-1} headSize={headSize} neckLength={neckLength} useStandard={useStandard} />
            </>
          ) : species.hasHorns ? (
            <>
              <mesh position={[headSize * 0.35, neckLength * 0.7, neckLength * 0.78]} rotation={[-0.35, 0, 0.35]}>
                <cylinderGeometry args={[headSize * 0.045, headSize * 0.075, headSize * 1.15, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.5, 0.2)}
              </mesh>
              <mesh position={[-headSize * 0.35, neckLength * 0.7, neckLength * 0.78]} rotation={[-0.35, 0, -0.35]}>
                <cylinderGeometry args={[headSize * 0.045, headSize * 0.075, headSize * 1.15, 6]} />
                {bodyMaterial('#d4b878', useStandard, 0.5, 0.2)}
              </mesh>
            </>
          ) : null}
        </group>

        {/* 尾巴 */}
        <group position={[0, bodyHeight * 0.08, -bodyLength * 0.46]} rotation={rig.tail}>
          <mesh position={[0, 0, -tailLength * 0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[tailRadius * 0.4, tailRadius, tailLength, 8]} />
            {bodyMaterial(color, useStandard, 0.7, 0.05)}
          </mesh>
          {species.kind === 'lion' ? (
            <mesh position={[0, tailRadius * 0.1, -tailLength * 0.98]} rotation={[Math.PI / 2, 0, 0]}>
              <sphereGeometry args={[tailRadius * 2.3, 10, 8]} />
              {bodyMaterial(maneColor, useStandard, 0.86, 0.02)}
            </mesh>
          ) : null}
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
        { rig: rig.frontLeftLeg, pos: [sideX, chestY, frontZ] },
        { rig: rig.frontRightLeg, pos: [-sideX, chestY, frontZ] },
        { rig: rig.rearLeftLeg, pos: [sideX, hipY, rearZ] },
        { rig: rig.rearRightLeg, pos: [-sideX, hipY, rearZ] },
      ] as const).map((leg, idx) => (
        <group key={idx} position={leg.pos as [number, number, number]} rotation={leg.rig}>
          <mesh position={[0, -legLen * 0.5, 0]}>
            <capsuleGeometry args={[legRadius, legLen, 4, 8]} />
            {bodyMaterial(color, useStandard, 0.75, 0.05)}
          </mesh>
          <group position={[0, -legLen, 0]}>
            <QuadrupedFoot species={species} legRadius={legRadius} footZ={footZ} clawColor={clawColor} useStandard={useStandard} color={color} />
          </group>
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
          <CreatureEyePair
            y={bodyRadius * 0.42}
            z={bodyRadius * 1.94}
            spacing={bodyRadius * 0.34}
            size={bodyRadius * 0.09}
            useStandard={useStandard}
            color={eyeColor}
          />
          {([-1, 1] as const).map(sign => (
            <mesh key={`whisker-${sign}`} position={[sign * bodyRadius * 0.55, bodyRadius * 0.18, bodyRadius * 2.08]} rotation={[Math.PI / 2, 0, sign * 0.6]}>
              <cylinderGeometry args={[bodyRadius * 0.025, bodyRadius * 0.025, bodyRadius * 1.45, 6]} />
              {bodyMaterial(whiskerColor, useStandard, 0.55, 0.05)}
            </mesh>
          ))}
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
        { rig: rig.frontLeftLeg, pos: [bodyRadius * 1.1, bodyY - bodyRadius * 0.2, species.bodyLength * 0.24] },
        { rig: rig.frontRightLeg, pos: [-bodyRadius * 1.1, bodyY - bodyRadius * 0.2, species.bodyLength * 0.24] },
        { rig: rig.rearLeftLeg, pos: [bodyRadius * 1.15, bodyY - bodyRadius * 0.12, -species.bodyLength * 0.2] },
        { rig: rig.rearRightLeg, pos: [-bodyRadius * 1.15, bodyY - bodyRadius * 0.12, -species.bodyLength * 0.2] },
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
