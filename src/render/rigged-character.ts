import { Box3, Group, Object3D, SkinnedMesh, Vector3 } from "three";

export type AcquiredCharacterKey = "claudia" | "carla" | "realistic-man";

export const CHARACTER_MODEL_FILES: Readonly<Record<AcquiredCharacterKey, string>> = {
  claudia: "models/claudia.glb",
  carla: "models/carla.glb",
  "realistic-man": "models/realistic-man.glb",
};

/**
 * Normalization for the technical navigation preview. It preserves the rig's
 * body proportions and skin weights; final character-specific sizes/yaw must
 * still be calibrated against real visual screenshots.
 */
export function fitRigToActor(rig: Group, targetHeightMeters: number): void {
  if (!Number.isFinite(targetHeightMeters) || targetHeightMeters <= 0) {
    throw new Error("Invalid character target height");
  }
  const bounds = new Box3().setFromObject(rig);
  const size = bounds.getSize(new Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 0.001) {
    throw new Error("Character rig has no usable visible geometry");
  }
  const scale = targetHeightMeters / size.y;
  const center = bounds.getCenter(new Vector3());
  rig.scale.setScalar(scale);
  rig.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
}

export function requireSkinnedRig(scene: Object3D): void {
  let skinned = false;
  scene.traverse(object => {
    if (object instanceof SkinnedMesh && object.skeleton?.bones.length) skinned = true;
  });
  if (!skinned) throw new Error("GLB does not contain a rigged human mesh");
}
