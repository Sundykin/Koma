import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  LinghuiDirector3DActor,
} from '../../../types/linghui';
import { Director3DMannequin } from './Director3DMannequin';
import { Director3DLiteMannequin } from './Director3DLiteMannequin';
import { Director3DFormation } from './Director3DFormation';
import { Director3DCreature } from './Director3DCreatureMesh';
import { Director3DProp } from './Director3DProp';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function samePosition(a: [number, number, number], b: [number, number, number]) {
  return Math.abs(a[0] - b[0]) < 0.0001
    && Math.abs(a[1] - b[1]) < 0.0001
    && Math.abs(a[2] - b[2]) < 0.0001;
}

function normalizeAngleRadians(value: number): number {
  let next = value;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

interface ActorDragLayerProps {
  actors: LinghuiDirector3DActor[];
  selectedActorId?: string | null;
  renderMode: 'preview' | 'lineart' | 'silhouette';
  onActorPress?: (actorId: string) => void;
  onActorMove?: (actorId: string, position: [number, number, number]) => void;
  onActorRotate?: (actorId: string, rotationY: number) => void;
  onActorDragStart?: () => void;
  onActorDragEnd?: () => void;
}

type ActorDragMode = 'move' | 'height' | 'rotate';

interface ActorDragSession {
  id: string;
  mode: ActorDragMode;
  pointerId: number;
  planeY: number;
  offset: THREE.Vector3;
  lastPosition: [number, number, number] | null;
  startClientY: number;
  startY: number;
  startRotationY: number;
  startAngle: number;
  lastRotationY: number | null;
}

export const ActorDragLayer: React.FC<ActorDragLayerProps> = ({
  actors,
  selectedActorId,
  renderMode,
  onActorPress,
  onActorMove,
  onActorRotate,
  onActorDragStart,
  onActorDragEnd,
}) => {
  const { camera, gl } = useThree();
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const dragPlaneRef = useRef(new THREE.Plane(WORLD_UP, 0));
  const dragHitRef = useRef(new THREE.Vector3());
  const dragSessionRef = useRef<ActorDragSession | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; position: [number, number, number] } | null>(null);
  const [rotationPreview, setRotationPreview] = useState<{ id: string; rotationY: number } | null>(null);

  const applyPreviewToActor = useCallback((actor: LinghuiDirector3DActor): LinghuiDirector3DActor => {
    const movingActor = dragPreview ? actors.find(item => item.id === dragPreview.id) : null;
    if (dragPreview && movingActor) {
      if (actor.id === dragPreview.id) {
        return { ...actor, position: dragPreview.position };
      }
      if (movingActor.groupId && actor.groupId === movingActor.groupId) {
        const dx = dragPreview.position[0] - movingActor.position[0];
        const dy = dragPreview.position[1] - movingActor.position[1];
        const dz = dragPreview.position[2] - movingActor.position[2];
        return {
          ...actor,
          position: [
            Number((actor.position[0] + dx).toFixed(4)),
            Number((actor.position[1] + dy).toFixed(4)),
            Number((actor.position[2] + dz).toFixed(4)),
          ],
        };
      }
    }

    const rotatingActor = rotationPreview ? actors.find(item => item.id === rotationPreview.id) : null;
    if (rotationPreview && rotatingActor) {
      const delta = normalizeAngleRadians(rotationPreview.rotationY - rotatingActor.rotationY);
      if (actor.id === rotationPreview.id && !rotatingActor.groupId) {
        return { ...actor, rotationY: rotationPreview.rotationY };
      }
      if (rotatingActor.groupId && actor.groupId === rotatingActor.groupId) {
        const members = actors.filter(item => item.groupId === rotatingActor.groupId);
        const mountPivot = members.find(item => item.groupRole === 'mount')?.position;
        const averagePivot: [number, number, number] = [
          members.reduce((sum, item) => sum + item.position[0], 0) / Math.max(1, members.length),
          members.reduce((sum, item) => sum + item.position[1], 0) / Math.max(1, members.length),
          members.reduce((sum, item) => sum + item.position[2], 0) / Math.max(1, members.length),
        ];
        const pivot = mountPivot ?? averagePivot;
        const dx = actor.position[0] - pivot[0];
        const dz = actor.position[2] - pivot[2];
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);
        return {
          ...actor,
          position: [
            Number((pivot[0] + dx * cos - dz * sin).toFixed(4)),
            actor.position[1],
            Number((pivot[2] + dx * sin + dz * cos).toFixed(4)),
          ],
          rotationY: normalizeAngleRadians(actor.rotationY + delta),
        };
      }
      if (actor.id === rotationPreview.id) {
        return { ...actor, rotationY: rotationPreview.rotationY };
      }
    }

    return actor;
  }, [actors, dragPreview, rotationPreview]);

  const getPlaneHit = useCallback((clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    camera.updateMatrixWorld();
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    dragPlaneRef.current.set(WORLD_UP, -planeY);

    const hit = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, dragHitRef.current);
    return hit ? hit.clone() : null;
  }, [camera, gl.domElement]);

  const endDrag = useCallback((pointerId?: number) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (typeof pointerId === 'number' && session.pointerId !== pointerId) return;

    dragSessionRef.current = null;
    if ((session.mode === 'move' || session.mode === 'height') && session.lastPosition) {
      onActorMove?.(session.id, session.lastPosition);
    } else if (session.mode === 'rotate' && typeof session.lastRotationY === 'number') {
      onActorRotate?.(session.id, session.lastRotationY);
    }
    onActorDragEnd?.();
  }, [onActorDragEnd, onActorMove, onActorRotate]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();
      if (session.mode === 'move') {
        const hit = getPlaneHit(event.clientX, event.clientY, session.planeY);
        if (!hit) return;

        hit.add(session.offset);
        const position: [number, number, number] = [
          Number(hit.x.toFixed(4)),
          session.planeY,
          Number(hit.z.toFixed(4)),
        ];
        session.lastPosition = position;
        setDragPreview({ id: session.id, position });
        return;
      }

      if (session.mode === 'height') {
        const nextY = Math.max(-1, Math.min(8, session.startY - (event.clientY - session.startClientY) * 0.01));
        const actor = actors.find(item => item.id === session.id);
        if (!actor) return;
        const position: [number, number, number] = [
          actor.position[0],
          Number(nextY.toFixed(4)),
          actor.position[2],
        ];
        session.lastPosition = position;
        setDragPreview({ id: session.id, position });
        return;
      }

      const actor = actors.find(item => item.id === session.id);
      if (!actor) return;
      const hit = getPlaneHit(event.clientX, event.clientY, actor.position[1]);
      if (!hit) return;
      const angle = Math.atan2(hit.x - actor.position[0], hit.z - actor.position[2]);
      const rotationY = session.startRotationY + (angle - session.startAngle);
      const rounded = Number(rotationY.toFixed(4));
      session.lastRotationY = rounded;
      setRotationPreview({ id: session.id, rotationY: rounded });
    };

    const handlePointerUp = (event: PointerEvent) => {
      endDrag(event.pointerId);
    };

    const handleBlur = () => {
      endDrag();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [actors, endDrag, getPlaneHit]);

  useEffect(() => {
    if (!dragPreview || dragSessionRef.current?.id === dragPreview.id) return;
    const actor = actors.find(item => item.id === dragPreview.id);
    if (actor && samePosition(actor.position, dragPreview.position)) {
      setDragPreview(null);
    }
  }, [actors, dragPreview]);

  useEffect(() => {
    if (!rotationPreview || dragSessionRef.current?.id === rotationPreview.id) return;
    const actor = actors.find(item => item.id === rotationPreview.id);
    if (actor && Math.abs(actor.rotationY - rotationPreview.rotationY) < 0.0001) {
      setRotationPreview(null);
    }
  }, [actors, rotationPreview]);

  const startDrag = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>, mode: ActorDragMode) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();

    const nativeEvent = event.nativeEvent;
    const planeY = actor.position[1];
    const actorPosition = new THREE.Vector3().fromArray(actor.position);
    const hit = getPlaneHit(nativeEvent.clientX, nativeEvent.clientY, planeY);

    dragSessionRef.current = {
      id: actor.id,
      mode,
      pointerId: nativeEvent.pointerId,
      planeY,
      offset: hit ? actorPosition.sub(hit) : new THREE.Vector3(),
      lastPosition: null,
      startClientY: nativeEvent.clientY,
      startY: actor.position[1],
      startRotationY: actor.rotationY,
      startAngle: hit ? Math.atan2(hit.x - actor.position[0], hit.z - actor.position[2]) : actor.rotationY,
      lastRotationY: null,
    };
    onActorPress?.(actor.id);
    onActorDragStart?.();
  }, [getPlaneHit, onActorDragStart, onActorPress]);

  const handleActorPointerDown = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>) => {
    startDrag(actor, event, 'move');
  }, [startDrag]);

  const handleHeightPointerDown = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>) => {
    startDrag(actor, event, 'height');
  }, [startDrag]);

  const handleRotatePointerDown = useCallback((actor: LinghuiDirector3DActor, event: ThreeEvent<PointerEvent>) => {
    startDrag(actor, event, 'rotate');
  }, [startDrag]);

  return (
    <>
      {actors.map((actor) => {
        const renderActor = applyPreviewToActor(actor);
        const shared = {
          actor: renderActor,
          selected: actor.id === selectedActorId,
          renderMode,
          onPointerDown: (event: ThreeEvent<PointerEvent>) => handleActorPointerDown(actor, event),
        };
        if (actor.type === 'mannequin') {
          return <Director3DMannequin key={actor.id} {...shared} />;
        }
        if (actor.type === 'mannequin-lite') {
          return <Director3DLiteMannequin key={actor.id} {...shared} />;
        }
        if (actor.type === 'formation') {
          return <Director3DFormation key={actor.id} {...shared} />;
        }
        if (actor.type === 'creature') {
          return <Director3DCreature key={actor.id} {...shared} />;
        }
        return (
          <Director3DProp key={actor.id} {...shared} />
        );
      })}
      {selectedActorId ? (() => {
        const selected = actors.find(actor => actor.id === selectedActorId);
        if (!selected) return null;
        const previewSelected = applyPreviewToActor(selected);
        const position = previewSelected.position;
        const rotationY = previewSelected.rotationY;
        const radius = selected.type === 'creature'
          ? Math.max(0.75, selected.scale * 0.75)
          : Math.max(0.45, selected.scale * 0.45);
        return (
          <group position={position}>
            <mesh position={[0, 1.95 * selected.scale, 0]} onPointerDown={(event) => handleHeightPointerDown(selected, event)}>
              <sphereGeometry args={[0.085, 16, 12]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
            </mesh>
            <mesh position={[0, 0.98 * selected.scale, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 1.9 * selected.scale, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.62} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} onPointerDown={(event) => handleRotatePointerDown(selected, event)}>
              <ringGeometry args={[radius, radius + 0.035, 48]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.78} />
            </mesh>
            <mesh
              position={[Math.sin(rotationY) * (radius + 0.12), 0.08, Math.cos(rotationY) * (radius + 0.12)]}
              onPointerDown={(event) => handleRotatePointerDown(selected, event)}
            >
              <sphereGeometry args={[0.07, 16, 12]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
            </mesh>
          </group>
        );
      })() : null}
    </>
  );
};
