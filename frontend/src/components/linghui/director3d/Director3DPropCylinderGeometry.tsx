import type { ReactNode } from 'react';

interface Director3DPropCylinderGeometryProps {
  kind: string;
  material: ReactNode;
  detailMaterial: (key: string, roughness?: number, metalness?: number) => ReactNode;
  boxLeg: (key: string, x: number, z: number, h: number, radius?: number) => ReactNode;
}

export function Director3DPropCylinderGeometry({
  kind,
  material,
  detailMaterial,
  boxLeg,
}: Director3DPropCylinderGeometryProps) {
  return (
        <>
              {kind === 'tree' ? (
                <group>
                  <mesh position={[0, 0.68, 0]}>
                    <cylinderGeometry args={[0.12, 0.18, 1.35, 12]} />
                    {detailMaterial('bark', 0.82, 0.03)}
                  </mesh>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <mesh key={`tree-bark-ridge-${i}`} position={[0, 0.42 + i * 0.18, 0.145]} rotation={[0.08, 0, (i % 2 === 0 ? 1 : -1) * 0.12]}>
                      <boxGeometry args={[0.028, 0.16, 0.018]} />
                      {detailMaterial('dark', 0.86, 0.02)}
                    </mesh>
                  ))}
                  {[0, 1, 2].map((i) => (
                    <mesh key={`tree-crown-${i}`} position={[(i - 1) * 0.18, 1.42 + (i % 2) * 0.12, (i % 2) * 0.1]} scale={[1, 0.82, 1]}>
                      <sphereGeometry args={[0.45 - i * 0.03, 16, 12]} />
                      {detailMaterial('leaf', 0.86, 0.02)}
                    </mesh>
                  ))}
                  {[-0.08, 0.08].map((x, i) => (
                    <mesh key={`tree-branch-${i}`} position={[x, 1.05, 0.08]} rotation={[0.8, 0, x > 0 ? -0.55 : 0.55]}>
                      <cylinderGeometry args={[0.025, 0.04, 0.46, 8]} />
                      {detailMaterial('bark', 0.82, 0.03)}
                    </mesh>
                  ))}
                </group>
              ) : kind === 'bush' ? (
                <group>
                  {[-1, 0, 1].map((x) => (
                    <mesh key={`bush-${x}`} position={[x * 0.22, 0.34 + Math.abs(x) * 0.08, 0]} scale={[1, 0.72, 1]}>
                      <sphereGeometry args={[0.32, 14, 10]} />
                      {detailMaterial('leaf', 0.88, 0.02)}
                    </mesh>
                  ))}
                </group>
              ) : kind === 'bike' ? (
                <group position={[0, 0.34, 0]}>
                  {[-1, 1].map(sign => (
                    <mesh key={`bike-wheel-${sign}`} position={[sign * 0.42, 0, 0]}>
                      <torusGeometry args={[0.22, 0.018, 8, 24]} />
                      {detailMaterial('tire', 0.75, 0.08)}
                    </mesh>
                  ))}
                  {[-1, 1].flatMap(sign => [0, 1, 2, 3].map(i => (
                    <mesh key={`bike-spoke-${sign}-${i}`} position={[sign * 0.42, 0, 0]} rotation={[0, 0, i * Math.PI / 4]}>
                      <boxGeometry args={[0.01, 0.39, 0.01]} />
                      {detailMaterial('metal', 0.38, 0.24)}
                    </mesh>
                  )))}
                  {[-1, 1].map(sign => (
                    <mesh key={`bike-hub-${sign}`} position={[sign * 0.42, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <cylinderGeometry args={[0.045, 0.045, 0.035, 12]} />
                      {detailMaterial('metal', 0.38, 0.24)}
                    </mesh>
                  ))}
                  {[
                    { key: 'frame-bottom', pos: [0, 0.09, 0] as [number, number, number], rot: 0, len: 0.72 },
                    { key: 'frame-front', pos: [0.2, 0.18, 0] as [number, number, number], rot: -0.7, len: 0.48 },
                    { key: 'frame-back', pos: [-0.2, 0.18, 0] as [number, number, number], rot: 0.7, len: 0.48 },
                    { key: 'frame-top', pos: [0, 0.28, 0] as [number, number, number], rot: 0, len: 0.52 },
                  ].map(bar => (
                    <mesh key={bar.key} position={bar.pos} rotation={[0, 0, Math.PI / 2 + bar.rot]}>
                      <cylinderGeometry args={[0.016, 0.016, bar.len, 8]} />
                      {detailMaterial('metal', 0.42, 0.28)}
                    </mesh>
                  ))}
                  <mesh position={[0.42, 0.22, 0]} rotation={[0, 0, 0.16]}>
                    <cylinderGeometry args={[0.014, 0.014, 0.48, 8]} />
                    {detailMaterial('metal', 0.42, 0.28)}
                  </mesh>
                  <mesh position={[-0.24, 0.25, 0]} rotation={[0, 0, -0.08]}>
                    <cylinderGeometry args={[0.014, 0.014, 0.32, 8]} />
                    {detailMaterial('metal', 0.42, 0.28)}
                  </mesh>
                  <mesh position={[0.12, 0.32, 0]}>
                    <boxGeometry args={[0.25, 0.045, 0.12]} />
                    {detailMaterial('dark', 0.6, 0.08)}
                  </mesh>
                  <mesh position={[0.5, 0.42, 0]} rotation={[0, 0, 0.18]}>
                    <boxGeometry args={[0.24, 0.025, 0.06]} />
                    {detailMaterial('dark', 0.55, 0.08)}
                  </mesh>
                  <mesh position={[0.48, 0.38, 0]} rotation={[0, 0, 0.18]}>
                    <cylinderGeometry args={[0.012, 0.012, 0.3, 8]} />
                    {detailMaterial('metal', 0.42, 0.28)}
                  </mesh>
                </group>
              ) : kind === 'mic' ? (
                <group>
                  <mesh position={[0, 0.48, 0]}>
                    <cylinderGeometry args={[0.025, 0.025, 0.86, 10]} />
                    {detailMaterial('metal', 0.4, 0.25)}
                  </mesh>
                  <mesh position={[0, 0.93, 0]}>
                    <sphereGeometry args={[0.12, 16, 10]} />
                    {detailMaterial('dark', 0.52, 0.12)}
                  </mesh>
                  {[0, 1, 2].map(i => (
                    <mesh key={`mic-grille-${i}`} position={[0, 0.91 + i * 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <torusGeometry args={[0.104 - i * 0.01, 0.004, 6, 18]} />
                      {detailMaterial('metal', 0.4, 0.22)}
                    </mesh>
                  ))}
                  <mesh position={[0, 0.08, 0]}>
                    <cylinderGeometry args={[0.22, 0.22, 0.04, 18]} />
                    {detailMaterial('metal', 0.48, 0.2)}
                  </mesh>
                </group>
              ) : kind === 'pillar' ? (
                <group>
                  <mesh position={[0, 0.5, 0]}>
                    <cylinderGeometry args={[0.18, 0.2, 1, 18]} />
                    {detailMaterial('stone', 0.86, 0.05)}
                  </mesh>
                  {[0.08, 0.5, 0.92].map((y, i) => (
                    <mesh key={`pillar-ring-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <torusGeometry args={[0.2, i === 1 ? 0.012 : 0.024, 8, 24]} />
                      {detailMaterial('metal', 0.62, 0.12)}
                    </mesh>
                  ))}
                  <mesh position={[0, 1.04, 0]}>
                    <cylinderGeometry args={[0.26, 0.22, 0.12, 18]} />
                    {detailMaterial('stone', 0.86, 0.05)}
                  </mesh>
                </group>
              ) : kind === 'candle' ? (
                <group>
                  <mesh position={[0, 0.28, 0]}>
                    <cylinderGeometry args={[0.07, 0.08, 0.56, 16]} />
                    {detailMaterial('light', 0.72, 0.05)}
                  </mesh>
                  <mesh position={[0, 0.6, 0]} rotation={[0, 0, Math.PI]}>
                    <coneGeometry args={[0.09, 0.22, 14]} />
                    {detailMaterial('light', 0.32, 0.02)}
                  </mesh>
                  <mesh position={[0, 0.62, 0]}>
                    <sphereGeometry args={[0.045, 12, 8]} />
                    {detailMaterial('light', 0.28, 0.02)}
                  </mesh>
                  <mesh position={[0, 0.02, 0]}>
                    <cylinderGeometry args={[0.16, 0.16, 0.04, 18]} />
                    {detailMaterial('metal', 0.44, 0.2)}
                  </mesh>
                </group>
              ) : kind === 'stool' ? (
                <group>
                  <mesh position={[0, 0.46, 0]}>
                    <cylinderGeometry args={[0.32, 0.32, 0.1, 18]} />
                    {detailMaterial('wood', 0.72, 0.04)}
                  </mesh>
                  {[0, 1, 2].map(i => {
                    const a = i * (Math.PI * 2 / 3);
                    return boxLeg(`stool-leg-${i}`, Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.42, 0.026);
                  })}
                </group>
              ) : kind === 'pedestal' ? (
                <group>
                  <mesh position={[0, 0.38, 0]}>
                    <cylinderGeometry args={[0.28, 0.34, 0.76, 24]} />
                    {detailMaterial('stone', 0.86, 0.05)}
                  </mesh>
                  <mesh position={[0, 0.79, 0]}>
                    <cylinderGeometry args={[0.38, 0.34, 0.12, 24]} />
                    {detailMaterial('metal', 0.65, 0.12)}
                  </mesh>
                </group>
              ) : (
                <group>
                  <mesh position={[0, 0.45, 0]}>
                    <cylinderGeometry args={[0.34, 0.39, 0.9, 18]} />
                    {material}
                  </mesh>
                  {kind === 'barrel' ? (
                    <>
                      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.36, 0.025, 8, 24]} />
                        {detailMaterial('metal', 0.45, 0.22)}
                      </mesh>
                      <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.355, 0.018, 8, 24]} />
                        {detailMaterial('metal', 0.45, 0.22)}
                      </mesh>
                      <mesh position={[0, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.36, 0.025, 8, 24]} />
                        {detailMaterial('metal', 0.45, 0.22)}
                      </mesh>
                      {Array.from({ length: 6 }).map((_, i) => {
                        const a = i * (Math.PI * 2 / 6);
                        return (
                          <mesh key={`barrel-stave-${i}`} position={[Math.cos(a) * 0.35, 0.45, Math.sin(a) * 0.35]} rotation={[0, -a, 0]}>
                            <boxGeometry args={[0.032, 0.78, 0.018]} />
                            {detailMaterial('dark', 0.74, 0.04)}
                          </mesh>
                        );
                      })}
                    </>
                  ) : null}
                </group>
              )}
            </>
  );
}
