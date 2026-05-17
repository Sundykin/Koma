import type { ReactNode } from 'react';

interface Director3DPropBoxGeometryProps {
  kind: string;
  material: ReactNode;
  detailMaterial: (key: string, roughness?: number, metalness?: number) => ReactNode;
  boxLeg: (key: string, x: number, z: number, h: number, radius?: number) => ReactNode;
  woodSlat: (key: string, x: number, y: number, z: number, width: number, vertical?: boolean) => ReactNode;
  woodBeam: (key: string, position: [number, number, number], size: [number, number, number]) => ReactNode;
}

export function Director3DPropBoxGeometry({
  kind,
  material,
  detailMaterial,
  boxLeg,
  woodSlat,
  woodBeam,
}: Director3DPropBoxGeometryProps) {
  return (
        <>
              {kind === 'table' ? (
                <group>
                  <mesh position={[0, 0.72, 0]}>
                    <boxGeometry args={[1.35, 0.12, 0.72]} />
                    {detailMaterial('wood', 0.72, 0.04)}
                  </mesh>
                  {[-0.42, 0, 0.42].map((x, i) => woodSlat(`table-slat-${i}`, x, 0.785, 0.36, 0.32))}
                  {[-1, 1].flatMap(x => [-1, 1].map(z => boxLeg(`table-leg-${x}-${z}`, x * 0.55, z * 0.25, 0.68, 0.035)))}
                  {[
                    woodBeam('table-apron-front', [0, 0.58, 0.31], [1.18, 0.055, 0.04]),
                    woodBeam('table-apron-back', [0, 0.58, -0.31], [1.18, 0.055, 0.04]),
                    woodBeam('table-stretcher-left', [-0.55, 0.3, 0], [0.035, 0.04, 0.5]),
                    woodBeam('table-stretcher-right', [0.55, 0.3, 0], [0.035, 0.04, 0.5]),
                  ]}
                </group>
              ) : kind === 'chair' ? (
                <group>
                  <mesh position={[0, 0.46, 0]}>
                    <boxGeometry args={[0.6, 0.1, 0.55]} />
                    {detailMaterial('wood', 0.72, 0.04)}
                  </mesh>
                  <mesh position={[0, 0.82, -0.23]} rotation={[0.18, 0, 0]}>
                    <boxGeometry args={[0.62, 0.62, 0.08]} />
                    {detailMaterial('wood', 0.72, 0.04)}
                  </mesh>
                  {[-0.18, 0, 0.18].map((x, i) => woodSlat(`chair-back-slat-${i}`, x, 0.82, -0.18, 0.46, true))}
                  {[-1, 1].flatMap(x => [-1, 1].map(z => boxLeg(`chair-leg-${x}-${z}`, x * 0.22, z * 0.2, 0.42, 0.026)))}
                  {[
                    woodBeam('chair-front-rail', [0, 0.26, 0.22], [0.44, 0.035, 0.028]),
                    woodBeam('chair-side-rail-l', [-0.24, 0.28, 0], [0.03, 0.035, 0.38]),
                    woodBeam('chair-side-rail-r', [0.24, 0.28, 0], [0.03, 0.035, 0.38]),
                  ]}
                </group>
              ) : kind === 'bed' ? (
                <group>
                  <mesh position={[0, 0.34, 0]}>
                    <boxGeometry args={[1.55, 0.24, 0.9]} />
                    {detailMaterial('wood', 0.8, 0.03)}
                  </mesh>
                  <mesh position={[0, 0.51, 0.02]}>
                    <boxGeometry args={[1.42, 0.11, 0.78]} />
                    {detailMaterial('light', 0.95, 0.02)}
                  </mesh>
                  <mesh position={[0, 0.59, -0.04]}>
                    <boxGeometry args={[1.24, 0.045, 0.55]} />
                    {detailMaterial('glass', 0.95, 0.02)}
                  </mesh>
                  <mesh position={[0, 0.64, -0.38]}>
                    <boxGeometry args={[1.48, 0.54, 0.08]} />
                    {detailMaterial('wood', 0.78, 0.03)}
                  </mesh>
                  <mesh position={[0, 0.63, 0.28]}>
                    <boxGeometry args={[0.48, 0.12, 0.25]} />
                    {detailMaterial('light', 0.9, 0.01)}
                  </mesh>
                  {[-0.42, 0, 0.42].map((x, i) => woodBeam(`bed-head-slat-${i}`, [x, 0.66, -0.33], [0.04, 0.42, 0.035]))}
                </group>
              ) : kind === 'cabinet' ? (
                <group>
                  <mesh position={[0, 0.65, 0]}>
                    <boxGeometry args={[0.82, 1.25, 0.5]} />
                    {detailMaterial('wood', 0.74, 0.04)}
                  </mesh>
                  <mesh position={[0, 0.65, 0.26]}>
                    <boxGeometry args={[0.02, 1.12, 0.02]} />
                    {detailMaterial('dark', 0.7, 0.04)}
                  </mesh>
                  {([-1, 1] as const).map(sign => (
                    <mesh key={`cabinet-knob-${sign}`} position={[sign * 0.12, 0.68, 0.285]}>
                      <sphereGeometry args={[0.035, 10, 8]} />
                      {detailMaterial('metal', 0.45, 0.25)}
                    </mesh>
                  ))}
                  {[0.32, 0.68, 1.04].map((y, i) => (
                    <mesh key={`cabinet-shelf-${i}`} position={[0, y, 0.29]}>
                      <boxGeometry args={[0.7, 0.025, 0.03]} />
                      {detailMaterial('dark', 0.7, 0.04)}
                    </mesh>
                  ))}
                  {([-1, 1] as const).map(sign => (
                    <mesh key={`cabinet-door-panel-${sign}`} position={[sign * 0.2, 0.65, 0.285]}>
                      <boxGeometry args={[0.3, 0.92, 0.025]} />
                      {detailMaterial('wood', 0.82, 0.03)}
                    </mesh>
                  ))}
                </group>
              ) : kind === 'car' ? (
                <group>
                  <mesh position={[0, 0.38, 0]}>
                    <boxGeometry args={[1.4, 0.35, 0.72]} />
                    {material}
                  </mesh>
                  <mesh position={[0, 0.53, 0.38]}>
                    <boxGeometry args={[1.18, 0.18, 0.2]} />
                    {material}
                  </mesh>
                  <mesh position={[0, 0.63, -0.04]}>
                    <boxGeometry args={[0.78, 0.28, 0.46]} />
                    {detailMaterial('glass', 0.42, 0.08)}
                  </mesh>
                  {[-1, 1].map(sign => (
                    <mesh key={`car-side-window-${sign}`} position={[sign * 0.41, 0.65, -0.04]} scale={[0.08, 1, 1]}>
                      <boxGeometry args={[0.8, 0.22, 0.4]} />
                      {detailMaterial('glass', 0.42, 0.08)}
                    </mesh>
                  ))}
                  <mesh position={[0, 0.52, 0.38]}>
                    <boxGeometry args={[1.26, 0.12, 0.05]} />
                    {detailMaterial('metal', 0.45, 0.2)}
                  </mesh>
                  {[-1, 1].flatMap(x => [-1, 1].map(z => (
                    <mesh key={`wheel-${x}-${z}`} position={[x * 0.72, 0.2, z * 0.28]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.15, 0.15, 0.08, 18]} />
                      {detailMaterial('tire', 0.72, 0.08)}
                    </mesh>
                  )))}
                  {[-1, 1].flatMap(x => [-1, 1].map(z => (
                    <mesh key={`hub-${x}-${z}`} position={[x * 0.765, 0.2, z * 0.28]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.07, 0.07, 0.09, 16]} />
                      {detailMaterial('metal', 0.38, 0.28)}
                    </mesh>
                  )))}
                  {[-1, 1].flatMap(x => [-1, 1].flatMap(z => [0, 1, 2].map(i => (
                    <mesh
                      key={`wheel-spoke-${x}-${z}-${i}`}
                      position={[x * 0.772, 0.2, z * 0.28]}
                      rotation={[0, 0, i * Math.PI / 3]}
                    >
                      <boxGeometry args={[0.012, 0.19, 0.012]} />
                      {detailMaterial('metal', 0.38, 0.26)}
                    </mesh>
                  ))))}
                  {[-1, 1].map(sign => (
                    <mesh key={`car-door-line-${sign}`} position={[sign * 0.32, 0.45, 0.382]}>
                      <boxGeometry args={[0.018, 0.22, 0.018]} />
                      {detailMaterial('dark', 0.5, 0.08)}
                    </mesh>
                  ))}
                  <mesh position={[0, 0.39, 0.38]}>
                    <boxGeometry args={[0.62, 0.08, 0.035]} />
                    {detailMaterial('light', 0.35, 0.2)}
                  </mesh>
                  <mesh position={[0, 0.38, -0.38]}>
                    <boxGeometry args={[0.54, 0.06, 0.035]} />
                    {detailMaterial('dark', 0.45, 0.12)}
                  </mesh>
                </group>
              ) : kind === 'rock' ? (
                <group>
                  <mesh position={[0, 0.38, 0]} rotation={[0.08, 0.18, -0.12]} scale={[1.05, 0.82, 0.75]}>
                    <dodecahedronGeometry args={[0.55, 0]} />
                    {detailMaterial('stone', 0.95, 0.02)}
                  </mesh>
                  <mesh position={[0.22, 0.56, 0.08]} rotation={[0.1, -0.35, 0.18]} scale={[0.52, 0.36, 0.4]}>
                    <dodecahedronGeometry args={[0.35, 0]} />
                    {detailMaterial('metal', 0.95, 0.02)}
                  </mesh>
                  {[0, 1, 2].map(i => (
                    <mesh
                      key={`rock-crack-${i}`}
                      position={[-0.2 + i * 0.18, 0.65 - i * 0.08, 0.43]}
                      rotation={[0, 0, -0.55 + i * 0.28]}
                    >
                      <boxGeometry args={[0.22, 0.018, 0.018]} />
                      {detailMaterial('dark', 0.8, 0.02)}
                    </mesh>
                  ))}
                </group>
              ) : kind === 'crate' ? (
                <group>
                  <mesh position={[0, 0.4, 0]}>
                    <boxGeometry args={[0.9, 0.8, 0.6]} />
                    {detailMaterial('wood', 0.78, 0.03)}
                  </mesh>
                  {[-0.24, 0, 0.24].map((x, i) => woodSlat(`crate-board-${i}`, x, 0.4, 0.322, 0.68, true))}
                  <mesh position={[0, 0.4, 0.31]}>
                    <boxGeometry args={[0.82, 0.08, 0.025]} />
                    {detailMaterial('dark', 0.74, 0.04)}
                  </mesh>
                  {[
                    woodBeam('crate-top-edge', [0, 0.78, 0.32], [0.88, 0.055, 0.03]),
                    woodBeam('crate-bottom-edge', [0, 0.03, 0.32], [0.88, 0.055, 0.03]),
                    woodBeam('crate-left-edge', [-0.43, 0.4, 0.32], [0.055, 0.78, 0.03]),
                    woodBeam('crate-right-edge', [0.43, 0.4, 0.32], [0.055, 0.78, 0.03]),
                  ]}
                  <mesh position={[0, 0.4, 0.315]} rotation={[0, 0, 0.68]}>
                    <boxGeometry args={[0.9, 0.055, 0.025]} />
                    {detailMaterial('dark', 0.74, 0.04)}
                  </mesh>
                  <mesh position={[0, 0.4, 0.318]} rotation={[0, 0, -0.68]}>
                    <boxGeometry args={[0.9, 0.055, 0.025]} />
                    {detailMaterial('dark', 0.74, 0.04)}
                  </mesh>
                </group>
              ) : (
                <mesh position={[0, 0.4, 0]}>
                  <boxGeometry args={[0.9, 0.8, 0.6]} />
                  {material}
                </mesh>
              )}
            </>
  );
}
