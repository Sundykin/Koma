import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface CameraRigProps {
  yawTargetRef: React.MutableRefObject<number>;
  pitchTargetRef: React.MutableRefObject<number>;
  yawCurrentRef: React.MutableRefObject<number>;
  pitchCurrentRef: React.MutableRefObject<number>;
  fovRef: React.MutableRefObject<number>;
  autoRotateUntilRef: React.MutableRefObject<number>;
  isDraggingRef: React.MutableRefObject<boolean>;
}

export const CameraRig: React.FC<CameraRigProps> = React.memo(function CameraRig({
  yawTargetRef, pitchTargetRef, yawCurrentRef, pitchCurrentRef,
  fovRef, autoRotateUntilRef, isDraggingRef,
}) {
  const { camera, size, gl } = useThree();
  const tmpVec = useRef(new THREE.Vector3());

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (size.width > 0 && size.height > 0) {
      cam.aspect = size.width / size.height;
      cam.updateProjectionMatrix();
      gl.setSize(size.width, size.height, false);
    }
  }, [camera, gl, size.width, size.height]);

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.fov !== fovRef.current) { cam.fov = fovRef.current; cam.updateProjectionMatrix(); }
    if (Date.now() < autoRotateUntilRef.current && !isDraggingRef.current) { yawTargetRef.current += 0.0035; }
    const LERP = 0.18;
    yawCurrentRef.current += (yawTargetRef.current - yawCurrentRef.current) * LERP;
    pitchCurrentRef.current += (pitchTargetRef.current - pitchCurrentRef.current) * LERP;
    const yaw = yawCurrentRef.current, pitch = pitchCurrentRef.current;
    tmpVec.current.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    cam.position.set(0, 0, 0);
    cam.lookAt(tmpVec.current);
  });

  return null;
});
