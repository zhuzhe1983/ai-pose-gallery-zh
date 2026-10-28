// SPDX-License-Identifier: GPL-3.0-only
// Surface samples for offline fitting, taken from the real posed skin.
// Export in neutral only: rigid local samples are approximations at blended joints.
import * as THREE from "three";
import { humanBounds } from "./human.js";

export function surfaceMarkers(model) {
  if (!model.userData.human) throw Error("Contact markers require the human mesh");
  humanBounds(model);
  const skin = model.children.find((o) => o.isSkinnedMesh), markers = {};
  const pos = (key) => model[key].getWorldPosition(new THREE.Vector3());
  const regions = {};
  for (let i = 0; i < skin.geometry.attributes.position.count; i++) {
    const p = skin.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
    p.vertex = i;
    for (let c = 0; c < 4; c++) {
      if (skin.geometry.attributes.skinWeight.getComponent(i, c) < 0.55) continue;
      const key = skin.userData.jointKeys[skin.geometry.attributes.skinIndex.getComponent(i, c)];
      (regions[key] ||= []).push(p);
    }
  }
  const add = (name, joint, p) => {
    markers[name] = {joint, offset: model[joint].worldToLocal(p.clone()).toArray(), ...(Number.isInteger(p.vertex) ? {vertex:p.vertex} : {})};
  };
  const closest = (points, target) => points.reduce((a, p) => p.distanceToSquared(target) < a.distanceToSquared(target) ? p : a);
  for (const s of ["l", "r"]) {
    const ankle = `${s}_ankle`, knee = `${s}_knee`, leg = `${s}_leg`, wrist = `${s}_wrist`;
    const foot = regions[ankle], box = new THREE.Box3().setFromPoints(foot), center = box.getCenter(new THREE.Vector3());
    // The model faces +Z in its neutral pose. Toe endpoint is measured, not a fixed 14 cm offset.
    const tips = foot.filter(p => p.z > box.max.z - .012);
    const toe = tips.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/tips.length);
    add(`${s}_toe`, ankle, toe);
    add(`${s}_heel_sole`, ankle, closest(foot, new THREE.Vector3(center.x, box.min.y, box.min.z + .015)));
    add(`${s}_toe_sole`, ankle, closest(foot, new THREE.Vector3(center.x, box.min.y, box.max.z - .035)));
    add(`${s}_toe_top`, ankle, closest(foot, new THREE.Vector3(center.x, box.min.y + .045, box.max.z - .04)));
    // Extremal samples enclose the foot: do not let an unobserved toe or heel
    // protrude below the intended knee/shin contact plane.
    for (let a=0; a<8; a++) for (const y of [-1,0,1]) {
      const d=new THREE.Vector3(Math.cos(a*Math.PI/4),y,Math.sin(a*Math.PI/4));
      add(`${s}_foot_envelope_${a}_${y+1}`,ankle,foot.reduce((best,p)=>p.dot(d)>best.dot(d)?p:best));
    }
    foot.forEach((p,i)=>add(`${s}_foot_envelope_full_${i}`,ankle,p));
    const kp = pos(knee), ap = pos(ankle), hp = pos(leg);
    add(`${s}_thigh_axis`,leg,hp);
    add(`${s}_knee_axis`,knee,kp);
    const lower = [...regions[knee], ...regions[leg]];
    lower.filter(p=>p.y>kp.y-.16&&p.y<kp.y+.13).forEach((p,i)=>add(`${s}_kneecap_envelope_full_${i}`,knee,p));
    lower.filter(p=>p.y<kp.y-.12&&p.y>ap.y+.05).forEach((p,i)=>add(`${s}_shin_envelope_full_${i}`,knee,p));
    for(const [part,near] of [["kneecap",kp],["shin",kp.clone().lerp(ap,.72)]]){
      const patch=lower.filter(p=>p.distanceTo(near)<(part==='kneecap'?.16:.12));
      let a=0;
      for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]) {
        if(!x&&!y&&!z)continue;
        const d=new THREE.Vector3(x,y,z);
        add(`${s}_${part}_envelope_${a++}`,knee,patch.reduce((best,p)=>p.dot(d)>best.dot(d)?p:best));
      }
    }
    add(`${s}_kneecap`, knee, closest(lower, kp.clone().add(new THREE.Vector3(0,0,.05))));
    add(`${s}_shin`, knee, closest(regions[knee], kp.clone().lerp(ap,.72).add(new THREE.Vector3(0,0,.045))));
    const thigh = closest(regions[leg], hp.clone().lerp(kp,.20).add(new THREE.Vector3(0,0,.08)));
    for (const [j,frac] of [.15,.23,.31,.39].entries()) for(let a=0;a<12;a++) {
      const near=hp.clone().lerp(kp,frac).add(new THREE.Vector3(Math.cos(a*Math.PI/6)*.08,0,Math.sin(a*Math.PI/6)*.08));
      add(`${s}_thigh_patch_${j}_${a}`,leg,closest(regions[leg],near));
    }
    add(`${s}_thigh_front`, leg, thigh);
    // Surface normal points out from the thigh; constrain the opposite palm normal.
    add(`${s}_thigh_normal`, leg, thigh.clone().add(new THREE.Vector3(0,0,.03)));
    add(`${s}_thigh_down`, leg, thigh.clone().add(kp.clone().sub(hp).normalize().multiplyScalar(.06)));
    const wp=pos(wrist), middle=pos(`${s}_finger_2`), index=pos(`${s}_finger_1`), pinky=pos(`${s}_finger_4`);
    const forward=middle.clone().sub(wp).normalize();
    const normal=index.clone().sub(pinky).cross(forward).normalize();
    if (normal.dot(new THREE.Vector3(-Math.sign(wp.x),0,0)) < 0) normal.negate();
    const palm=closest(regions[wrist],wp.clone().lerp(middle,.6).addScaledVector(normal,.012));
    add(`${s}_palm`,wrist,palm);
    add(`${s}_palm_normal`,wrist,palm.clone().addScaledVector(normal,.03));
    add(`${s}_palm_forward`,wrist,palm.clone().addScaledVector(forward,.06));
  }
  return markers;
}
