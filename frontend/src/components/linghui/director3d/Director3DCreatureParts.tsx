import { resolveDirector3DColor } from './director3dColors';

export function bodyMaterial(color: string, useStandard: boolean, roughness = 0.7, metalness = 0.05) {
  return useStandard ? (
    <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
  ) : (
    <meshBasicMaterial color={color} />
  );
}

const HASH = String.fromCharCode(35);

export const DETAIL = {
  dark: `${HASH}17181d`,
  light: `${HASH}f7f1df`,
  stripe: `${HASH}211713`,
  claw: `${HASH}efe2c6`,
  gold: `${HASH}d4b878`,
  fire: `${HASH}ffb238`,
  red: `${HASH}c63224`,
};

export function detailColor(value: string, renderMode: 'preview' | 'lineart' | 'silhouette', fallback = value): string {
  if (renderMode === 'silhouette') return resolveDirector3DColor('var(--token-text-primary)', 'black');
  if (renderMode === 'lineart') return resolveDirector3DColor('var(--token-text-primary)', 'black');
  return resolveDirector3DColor(value, fallback);
}

export function CreatureEyePair({ y, z, spacing, size, useStandard, color }: {
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

export function CreatureEarPair({ y, z, spacing, size, useStandard, color, floppy = false }: {
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

export function StripeSet({ count, bodyWidth, bodyHeight, bodyLength, color, useStandard }: {
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

export function SpotSet({ count, bodyWidth, bodyHeight, bodyLength, color, useStandard }: {
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

export function WhiskerSet({ headSize, y, z, color, useStandard }: {
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

export function AntlerBranch({ side, headSize, neckLength, useStandard }: {
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
