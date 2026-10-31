import { Bone, Object3D, Quaternion, Vector3 } from "three";

/**
 * Anatomical clearance constraint for skinned, animated humanoid skeletons.
 *
 * An already-retargeted rig may have perfectly normalized bone quaternions but
 * place both elbows *inside* the torso. The old "many moving joints" test
 * failed to catch this. Restore plausible elbow/wrist clearance by rotating
 * real shoulder/upper-arm and forearm joints toward the closest pose that
 * preserves limb lengths. No model-specific angle, mesh offset, or artificial
 * replacement arm mesh is used.
 *
 * Apply only to legacy cross-rig Mixamo clips. A real same-rig Mixamo export
 * must play unmodified: it has its own validated bone directions.
 */
export class HumanoidArmClearance {
  private readonly hip: Bone;
  private readonly arms: readonly {
    side: number; shoulder: Bone; elbow: Bone; wrist: Bone;
    referenceLateral: number;
  }[];
  private readonly restWidth: number;
  private readonly pelvisAxis: Vector3;
  private readonly rig: Object3D;

  constructor(rig: Object3D) {
    this.rig = rig;
    const bones: Bone[] = [];
    rig.traverse(node => { if (node instanceof Bone) bones.push(node); });
    const normalized = (name: string) => name.toLowerCase()
      .replace(/^mixamorig:?/, "").replace(/_[0-9]+$/, "")
      .replace(/[^a-z]/g, "");
    const pick = (...keys: string[]) => bones.find(bone =>
      keys.includes(normalized(bone.name)));
    const hip = pick("hip", "hips");
    if (!hip) throw Error("Arm clearance requires a hip bone");
    this.hip = hip;
    this.rig.updateMatrixWorld(true);
    const pos = (bone: Bone) => bone.getWorldPosition(new Vector3());
    const leftShoulder = pick("upperarml", "leftarm");
    const rightShoulder = pick("upperarmr", "rightarm");
    if (!leftShoulder || !rightShoulder) throw Error("Arm clearance needs both upper arms");
    const leftPos = pos(leftShoulder);
    const rightPos = pos(rightShoulder);
    this.restWidth = leftPos.distanceTo(rightPos);
    if (!Number.isFinite(this.restWidth) || this.restWidth < 1e-6) {
      throw Error("Original humanoid shoulders have no usable lateral separation");
    }
    this.pelvisAxis = leftPos.clone().sub(rightPos).normalize();
    const center = pos(hip);
    this.arms = ([
      {side: 1, shoulder: leftShoulder,
        elbow: pick("lowerarml", "leftforearm"),
        wrist: pick("handl", "lefthand")},
      {side: -1, shoulder: rightShoulder,
        elbow: pick("lowerarmr", "rightforearm"),
        wrist: pick("handr", "righthand")},
    ] as const).map(arm => {
      if (!arm.elbow || !arm.wrist) {
        throw Error("Arm clearance requires two complete shoulder/elbow/hand chains");
      }
      const offset = pos(arm.shoulder).sub(center).dot(this.pelvisAxis) * arm.side;
      if (offset < this.restWidth * 0.15) {
        throw Error("Arm clearance cannot infer left/right side from original bind");
      }
      return {...arm, elbow: arm.elbow, wrist: arm.wrist, referenceLateral: offset};
    });
  }

  /**
   * Smallest correction bringing each elbow and wrist back to the anatomical
   * side of their torso, preserving every arm segment's geometric length.
   * The "inside" threshold derives from each arm's own original shoulder
   * lateral position. Never replace animation on a joint already plausible.
   */
  apply(): void {
    this.rig.updateMatrixWorld(true);
    // Hip can rotate during a clip; get the current side axis from the
    // calibrated rest axis transformed by the live hip quaternion.
    // A tiny/sign-flipped axis is not meaningful: reject rather than hide it.
    const hipPos = this.hip.getWorldPosition(new Vector3());
    const hipWorld = this.hip.getWorldQuaternion(new Quaternion());
    const hipRestWorld = this.restHipWorld;
    const worldDelta = hipWorld.clone().multiply(hipRestWorld.clone().invert());
    const axis = this.pelvisAxis.clone().applyQuaternion(worldDelta).normalize();
    for (const arm of this.arms) {
      const reference = arm.referenceLateral;
      // The shoulder root is an anatomical attachment point, not something
      // to push around by adding arbitrary local xyz translations.
      this.restoreJointClearance(arm.shoulder, arm.elbow, hipPos, axis,
        arm.side, reference * 0.9);
      // Repair a wrist that still crosses the chest after fixing its elbow.
      // This rotates ONLY the forearm; wrist and finger skinning follow it.
      this.restoreJointClearance(arm.elbow, arm.wrist, hipPos, axis,
        arm.side, reference * 0.75);
    }
  }

  private _restHipWorld?: Quaternion;
  private get restHipWorld(): Quaternion {
    if (!this._restHipWorld) throw Error("Uninitialized arm reference pose");
    return this._restHipWorld;
  }

  private restoreJointClearance(parent: Bone, child: Bone, origin: Vector3,
    axis: Vector3, side: number, required: number): void {
    const childPos = child.getWorldPosition(new Vector3());
    const elbowLateral = childPos.clone().sub(origin).dot(axis) * side;
    if (!Number.isFinite(elbowLateral)) throw Error("Non-finite human arm pose");
    if (elbowLateral >= required) return;

    const parentPos = parent.getWorldPosition(new Vector3());
    const desired = childPos.clone().addScaledVector(axis, side * (required-elbowLateral));
    const currentDir = childPos.clone().sub(parentPos);
    const desiredDir = desired.sub(parentPos);
    if (currentDir.lengthSq() < 1e-8 || desiredDir.lengthSq() < 1e-8) {
      throw Error("Arm joint has zero-length skeletal segment");
    }
    const rotateWorld = new Quaternion().setFromUnitVectors(
      currentDir.normalize(), desiredDir.normalize());
    // World correction converted into the arm joint's *actual parent* local
    // coordinate frame; this works for different shoulder and clavicle rigs.
    const parentWorld = parent.parent?.getWorldQuaternion(new Quaternion()) ??
      new Quaternion();
    const rotationLocal = parentWorld.clone().invert().multiply(rotateWorld)
      .multiply(parentWorld);
    parent.quaternion.premultiply(rotationLocal).normalize();
    parent.updateWorldMatrix(false, true);
  }

  /** Must be called after sampling the unanimated bind pose and before play. */
  captureReferencePose(): void {
    this.rig.updateMatrixWorld(true);
    this._restHipWorld = this.hip.getWorldQuaternion(new Quaternion());
  }
}
