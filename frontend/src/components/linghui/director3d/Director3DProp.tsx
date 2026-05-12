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

const HASH = String.fromCharCode(35);
const PROP_DETAIL = {
  dark: `${HASH}15171c`,
  wood: `${HASH}8b5a35`,
  leaf: `${HASH}3d8f55`,
  glass: `${HASH}7bc7e8`,
  metal: `${HASH}c8ced8`,
  tire: `${HASH}101217`,
  light: `${HASH}ffd166`,
  bark: `${HASH}6b4326`,
  stone: `${HASH}777b84`,
};

function propKind(label: string): string {
  const text = label.toLowerCase();
  if (text.includes('长桌') || text.includes('table')) return 'table';
  if (text.includes('椅') || text.includes('chair')) return 'chair';
  if (text.includes('凳') || text.includes('stool')) return 'stool';
  if (text.includes('床') || text.includes('bed')) return 'bed';
  if (text.includes('柜') || text.includes('cabinet') || text.includes('wardrobe')) return 'cabinet';
  if (text.includes('汽车') || text.includes('car')) return 'car';
  if (text.includes('自行车') || text.includes('bike') || text.includes('bicycle')) return 'bike';
  if (text.includes('树') || text.includes('tree')) return 'tree';
  if (text.includes('灌木') || text.includes('bush')) return 'bush';
  if (text.includes('岩石') || text.includes('rock')) return 'rock';
  if (text.includes('门') || text.includes('door')) return 'door';
  if (text.includes('窗') || text.includes('window')) return 'window';
  if (text.includes('屏幕') || text.includes('screen') || text.includes('display')) return 'screen';
  if (text.includes('聚光灯') || text.includes('light') || text.includes('spotlight')) return 'light';
  if (text.includes('麦克风') || text.includes('mic') || text.includes('microphone')) return 'mic';
  if (text.includes('基座') || text.includes('pedestal')) return 'pedestal';
  if (text.includes('方箱') || text.includes('crate')) return 'crate';
  if (text.includes('圆柱') || text.includes('barrel')) return 'barrel';
  return 'generic';
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
  const useStandard = renderMode === 'preview';
  const kind = propKind(actor.label);
  const detail = useMemo(() => {
    if (renderMode === 'silhouette') {
      const silhouette = resolveDirector3DColor('var(--token-text-primary)', 'black');
      return {
        dark: silhouette, wood: silhouette, leaf: silhouette, glass: silhouette,
        metal: silhouette, tire: silhouette, light: silhouette, bark: silhouette, stone: silhouette,
      };
    }
    if (renderMode === 'lineart') {
      const ink = resolveDirector3DColor('var(--token-text-primary)', 'black');
      return {
        dark: ink, wood: ink, leaf: ink, glass: ink,
        metal: ink, tire: ink, light: ink, bark: ink, stone: ink,
      };
    }
    return {
      dark: resolveDirector3DColor(PROP_DETAIL.dark, PROP_DETAIL.dark),
      wood: resolveDirector3DColor(PROP_DETAIL.wood, PROP_DETAIL.wood),
      leaf: resolveDirector3DColor(PROP_DETAIL.leaf, PROP_DETAIL.leaf),
      glass: resolveDirector3DColor(PROP_DETAIL.glass, PROP_DETAIL.glass),
      metal: resolveDirector3DColor(PROP_DETAIL.metal, PROP_DETAIL.metal),
      tire: resolveDirector3DColor(PROP_DETAIL.tire, PROP_DETAIL.tire),
      light: resolveDirector3DColor(PROP_DETAIL.light, PROP_DETAIL.light),
      bark: resolveDirector3DColor(PROP_DETAIL.bark, PROP_DETAIL.bark),
      stone: resolveDirector3DColor(PROP_DETAIL.stone, PROP_DETAIL.stone),
    };
  }, [renderMode]);
  const detailMaterial = (key: keyof typeof detail, roughness = 0.7, metalness = 0.08) => (
    useStandard
      ? <meshStandardMaterial color={detail[key]} roughness={roughness} metalness={metalness} />
      : <meshBasicMaterial color={detail[key]} />
  );
  const boxLeg = (key: string, x: number, z: number, h: number, radius = 0.04) => (
    <mesh key={key} position={[x, h * 0.5, z]}>
      <cylinderGeometry args={[radius, radius, h, 8]} />
      {detailMaterial('wood', 0.72, 0.04)}
    </mesh>
  );
  const woodSlat = (key: string, x: number, y: number, z: number, width: number, vertical = false) => (
    <mesh key={key} position={[x, y, z + 0.012]}>
      <boxGeometry args={vertical ? [0.035, width, 0.018] : [width, 0.035, 0.018]} />
      {detailMaterial('dark', 0.74, 0.04)}
    </mesh>
  );

  return (
    <group
      position={actor.position}
      rotation={[0, actor.rotationY, 0]}
      scale={[actor.scale, actor.scale, actor.scale]}
      onPointerDown={onPointerDown}
    >
      {actor.type === 'prop-box' && (
        <>
          {kind === 'table' ? (
            <group>
              <mesh position={[0, 0.72, 0]}>
                <boxGeometry args={[1.35, 0.12, 0.72]} />
                {detailMaterial('wood', 0.72, 0.04)}
              </mesh>
              {[-0.42, 0, 0.42].map((x, i) => woodSlat(`table-slat-${i}`, x, 0.785, 0.36, 0.32))}
              {[-1, 1].flatMap(x => [-1, 1].map(z => boxLeg(`table-leg-${x}-${z}`, x * 0.55, z * 0.25, 0.68, 0.035)))}
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
            </group>
          ) : kind === 'bed' ? (
            <group>
              <mesh position={[0, 0.34, 0]}>
                <boxGeometry args={[1.55, 0.24, 0.9]} />
                {detailMaterial('wood', 0.8, 0.03)}
              </mesh>
              <mesh position={[0, 0.52, 0.02]}>
                <boxGeometry args={[1.42, 0.12, 0.78]} />
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
            </group>
          ) : kind === 'car' ? (
            <group>
              <mesh position={[0, 0.38, 0]}>
                <boxGeometry args={[1.4, 0.35, 0.72]} />
                {material}
              </mesh>
              <mesh position={[0, 0.65, -0.04]}>
                <boxGeometry args={[0.72, 0.28, 0.54]} />
                {detailMaterial('glass', 0.42, 0.08)}
              </mesh>
              <mesh position={[0, 0.52, 0.38]}>
                <boxGeometry args={[1.26, 0.12, 0.05]} />
                {detailMaterial('metal', 0.45, 0.2)}
              </mesh>
              {[-1, 1].flatMap(x => [-1, 1].map(z => (
                <mesh key={`wheel-${x}-${z}`} position={[x * 0.52, 0.18, z * 0.28]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.15, 0.15, 0.08, 18]} />
                  {detailMaterial('tire', 0.72, 0.08)}
                </mesh>
              )))}
              {[-1, 1].map(sign => (
                <mesh key={`hub-${sign}`} position={[sign * 0.52, 0.18, 0.325]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.07, 0.07, 0.09, 16]} />
                  {detailMaterial('metal', 0.38, 0.28)}
                </mesh>
              ))}
              <mesh position={[0, 0.39, 0.38]}>
                <boxGeometry args={[0.62, 0.08, 0.035]} />
                {detailMaterial('light', 0.35, 0.2)}
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
      )}

      {actor.type === 'prop-cylinder' && (
        <>
          {kind === 'tree' ? (
            <group>
              <mesh position={[0, 0.68, 0]}>
                <cylinderGeometry args={[0.12, 0.18, 1.35, 12]} />
                {detailMaterial('bark', 0.82, 0.03)}
              </mesh>
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
                <mesh key={`bike-wheel-${sign}`} position={[sign * 0.42, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.22, 0.018, 8, 24]} />
                  {detailMaterial('tire', 0.75, 0.08)}
                </mesh>
              ))}
              <mesh position={[0, 0.12, 0]} rotation={[0, 0, 0.42]}>
                <cylinderGeometry args={[0.018, 0.018, 0.78, 8]} />
                {detailMaterial('metal', 0.42, 0.28)}
              </mesh>
              <mesh position={[0, 0.12, 0]} rotation={[0, 0, -0.42]}>
                <cylinderGeometry args={[0.018, 0.018, 0.78, 8]} />
                {detailMaterial('metal', 0.42, 0.28)}
              </mesh>
              <mesh position={[0.2, 0.28, 0]} rotation={[0, 0, 0.2]}>
                <cylinderGeometry args={[0.014, 0.014, 0.42, 8]} />
                {detailMaterial('metal', 0.42, 0.28)}
              </mesh>
              <mesh position={[0.12, 0.32, 0]}>
                <boxGeometry args={[0.25, 0.045, 0.12]} />
                {detailMaterial('dark', 0.6, 0.08)}
              </mesh>
              <mesh position={[0.45, 0.42, 0]} rotation={[0, 0, 0.18]}>
                <boxGeometry args={[0.22, 0.025, 0.06]} />
                {detailMaterial('dark', 0.55, 0.08)}
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
              <mesh position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.22, 0.22, 0.04, 18]} />
                {detailMaterial('metal', 0.48, 0.2)}
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
                <cylinderGeometry args={[0.35, 0.35, 0.9, 24]} />
                {material}
              </mesh>
              {kind === 'barrel' ? (
                <>
                  <mesh position={[0, 0.2, 0]}>
                    <torusGeometry args={[0.36, 0.025, 8, 24]} />
                    {detailMaterial('metal', 0.45, 0.22)}
                  </mesh>
                  <mesh position={[0, 0.45, 0]}>
                    <torusGeometry args={[0.355, 0.018, 8, 24]} />
                    {detailMaterial('metal', 0.45, 0.22)}
                  </mesh>
                  <mesh position={[0, 0.7, 0]}>
                    <torusGeometry args={[0.36, 0.025, 8, 24]} />
                    {detailMaterial('metal', 0.45, 0.22)}
                  </mesh>
                </>
              ) : null}
            </group>
          )}
        </>
      )}

      {actor.type === 'prop-plane' && (
        <group>
          <mesh position={[0, 1, 0]}>
            <boxGeometry args={[1.6, 2, 0.05]} />
            {material}
          </mesh>
          {kind === 'door' ? (
            <>
              <mesh position={[0, 1, 0.035]}>
                <boxGeometry args={[1.36, 1.72, 0.035]} />
                {detailMaterial('wood', 0.78, 0.03)}
              </mesh>
              <mesh position={[0.48, 0.98, 0.07]}>
                <sphereGeometry args={[0.055, 10, 8]} />
                {detailMaterial('metal', 0.42, 0.28)}
              </mesh>
            </>
          ) : kind === 'window' ? (
            <>
              <mesh position={[0, 1, 0.04]}>
                <boxGeometry args={[1.32, 1.42, 0.035]} />
                {detailMaterial('glass', 0.35, 0.08)}
              </mesh>
              <mesh position={[0, 1, 0.08]}>
                <boxGeometry args={[1.36, 0.055, 0.035]} />
                {detailMaterial('wood', 0.7, 0.04)}
              </mesh>
              <mesh position={[0, 1, 0.085]}>
                <boxGeometry args={[0.055, 1.42, 0.035]} />
                {detailMaterial('wood', 0.7, 0.04)}
              </mesh>
            </>
          ) : kind === 'screen' ? (
            <>
              <mesh position={[0, 1, 0.04]}>
                <boxGeometry args={[1.42, 1.72, 0.025]} />
                {detailMaterial('glass', 0.35, 0.1)}
              </mesh>
              <mesh position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.09, 0.09, 0.2, 14]} />
                {detailMaterial('metal', 0.45, 0.22)}
              </mesh>
            </>
          ) : null}
        </group>
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
          {kind === 'light' ? (
            <>
              <mesh position={[0, 0, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.26, 0.38, 20]} />
                {detailMaterial('metal', 0.42, 0.2)}
              </mesh>
              <mesh position={[0, 0, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.38, 0.82, 24, 1, true]} />
                <meshBasicMaterial color={detail.light} transparent opacity={0.24} side={THREE.DoubleSide} />
              </mesh>
            </>
          ) : (
            <>
              <mesh position={[0, 0.22, -0.08]}>
                <boxGeometry args={[0.22, 0.08, 0.12]} />
                {detailMaterial('dark', 0.5, 0.08)}
              </mesh>
              <mesh position={[0, -0.32, -0.08]}>
                <cylinderGeometry args={[0.035, 0.035, 0.64, 8]} />
                {detailMaterial('metal', 0.45, 0.18)}
              </mesh>
            </>
          )}
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
