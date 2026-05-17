import type { CreatureRig, CreatureSpeciesSpec } from './director3dCreature';
import {
  AntlerBranch,
  CreatureEarPair,
  CreatureEyePair,
  DETAIL,
  SpotSet,
  StripeSet,
  WhiskerSet,
  bodyMaterial,
  detailColor,
} from './Director3DCreatureParts';

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



export function QuadrupedBody({ species, rig, color, useStandard }: {
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
  const legAnchors = [
    { rig: rig.frontLeftLeg, pos: [sideX, chestY, frontZ] as [number, number, number], shoulder: true },
    { rig: rig.frontRightLeg, pos: [-sideX, chestY, frontZ] as [number, number, number], shoulder: true },
    { rig: rig.rearLeftLeg, pos: [sideX, hipY, rearZ] as [number, number, number], shoulder: false },
    { rig: rig.rearRightLeg, pos: [-sideX, hipY, rearZ] as [number, number, number], shoulder: false },
  ];

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
          {(species.kind === 'fox' ? [0, 1, 2, 3, 4] : [0]).map((_, i) => (
            <mesh
              key={`tail-tip-${i}`}
              position={[(i - (species.kind === 'fox' ? 2 : 0)) * tailRadius * 1.55, tailRadius * (species.kind === 'fox' ? 0.7 : 0.15), -tailLength * 0.95]}
              rotation={[Math.PI / 2, 0, (i - (species.kind === 'fox' ? 2 : 0)) * 0.18]}
            >
              <coneGeometry args={[tailRadius * (species.kind === 'fox' ? 1.8 : 0.9), tailLength * 0.28, 10]} />
              {bodyMaterial(species.kind === 'fox' ? detailColor(DETAIL.light, 'preview') : color, useStandard, 0.75, 0.03)}
            </mesh>
          ))}
        </group>
      </group>

      {/* 肩/胯连接球挂在 root：腿贴地时也能和躯干读成同一套骨架 */}
      {legAnchors.map((leg, idx) => (
        <mesh
          key={`leg-socket-${idx}`}
          position={leg.pos}
          scale={[1.2, leg.shoulder ? 0.82 : 0.72, 1.08]}
        >
          <sphereGeometry args={[legRadius * (species.kind === 'bear' ? 1.45 : 1.16), 12, 8]} />
          {bodyMaterial(color, useStandard, 0.74, 0.05)}
        </mesh>
      ))}

      {/* 4 条腿：分成上肢 / 膝关节 / 下肢，避免单根柱体动物感太弱 */}
      {legAnchors.map((leg, idx) => (
        <group key={idx} position={leg.pos as [number, number, number]} rotation={leg.rig}>
          <mesh position={[0, -legLen * 0.27, 0]} rotation={[idx < 2 ? 0.06 : -0.08, 0, 0]}>
            <capsuleGeometry args={[legRadius, legLen * 0.52, 4, 8]} />
            {bodyMaterial(color, useStandard, 0.75, 0.05)}
          </mesh>
          <mesh position={[0, -legLen * 0.54, idx < 2 ? footZ * 0.16 : -footZ * 0.1]}>
            <sphereGeometry args={[legRadius * 1.05, 10, 8]} />
            {bodyMaterial(color, useStandard, 0.75, 0.05)}
          </mesh>
          <mesh position={[0, -legLen * 0.78, footZ * 0.12]} rotation={[idx < 2 ? -0.08 : 0.1, 0, 0]}>
            <capsuleGeometry args={[legRadius * 0.82, legLen * 0.46, 4, 8]} />
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
