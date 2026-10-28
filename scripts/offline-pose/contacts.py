"""Explicit surface-contact priors, not contact recognition from 18 points."""
import numpy as np


def profile_for(pose):
    # This relationship was checked in the original front AND side references.
    if pose == "solo_kneel_hands-thighs":
        return {"name": "knees_shins_insteps_palms_on_thighs", "source": "manual_reference_relationship",
                "evidence": [f"img/{pose}_{v}.png" for v in ("f", "s")],
                "ground": [f"{s}_{part}" for s in ("l", "r") for part in ("kneecap", "shin", "toe_top")],
                "palms": ["l", "r"]}
    return None


class Contacts:
    def __init__(self, rig, profile):
        self.rig, self.profile = rig, profile
        self.markers = rig.data.get("surfacePoints", [])
        self.names = [m["name"] for m in self.markers]
        if profile and not self.markers:
            raise ValueError("Re-export a rig with actual surfacePoints for contact fitting")
        if profile and any(n not in self.names for n in profile["ground"]):
            raise ValueError("Contact profile names an unknown surface marker")

    def points(self, values):
        return dict(zip(self.names, self.rig.forward(values, self.markers)))

    def supports(self, p):
        return np.array([min(v[1] for n,v in p.items() if n.startswith(f"{s}_{part}_envelope_"))
                         for s in ("l","r") for part in ("kneecap","shin","foot")])

    def hand_target(self, p, s):
        unit=lambda v:v/max(np.linalg.norm(v),1e-8)
        down=unit(p[s+'_thigh_down']-p[s+'_thigh_front'])
        front=unit(np.array([0.,0.,1.])-down*down[2])
        points=np.array([v for n,v in p.items() if n.startswith(s+'_thigh_patch_')])
        # Front-facing thigh patch, independent of femur axial twist. A fixed
        # material vertex would wrongly pull the palm around the inner thigh.
        visible=points[(points@front)>np.max(points@front)-.025]
        center=p[s+'_thigh_axis']*.8+p[s+'_knee_axis']*.2
        centered=visible[np.abs(visible[:,0]-center[0])<.035]
        if len(centered):visible=centered
        target=min(visible,key=lambda v:np.linalg.norm(v-p[s+'_palm']))
        return target,front,down

    def residual(self, values):
        if not self.profile:
            return np.empty(0)
        p = self.points(values)
        heights = self.supports(p)
        rows = [6 * (heights - np.mean(heights))]
        envelopes=np.array([v[1] for n,v in p.items() if '_foot_envelope_' in n])
        rows.append(8*np.minimum(envelopes - np.mean(heights) + .003, 0))
        for s in self.profile["palms"]:
            palm = p[s+"_palm"]
            thigh,tn,tf=self.hand_target(p,s)
            unit=lambda v:v/max(np.linalg.norm(v),1e-8)
            pn = unit(p[s+"_palm_normal"]-palm)
            pf = unit(p[s+"_palm_forward"]-palm)
            rows.extend([4 * (palm - thigh - .004 * tn), .20*(pn+tn), .12*(pf-tf)])
        return np.concatenate(rows)

    def assess(self, values):
        if not self.profile:
            return {"status": "unresolved", "reason": "No reviewed contact relationship; grounding alone does not infer supports", "passed": False}
        p = self.points(values)
        h = self.supports(p)
        palms = []
        for s in self.profile["palms"]:
            target,tn,_=self.hand_target(p,s)
            pn=(p[s+"_palm_normal"]-p[s+"_palm"])/.03
            pn/=np.linalg.norm(pn);tn/=np.linalg.norm(tn)
            palms.append({"side":s,"gap_m":float(np.linalg.norm(p[s+"_palm"]-target)),
                          "normal_error_degrees":float(np.degrees(np.arccos(np.clip(-pn@tn,-1,1))))})
        spread=float(max(h)-min(h))
        return {"status":"surface_sample_constraints", "profile":self.profile,
                "ground_height_spread_m":spread,"palms":palms,
                "passed":spread<.018 and all(x["gap_m"]<.025 and x["normal_error_degrees"]<25 for x in palms),
                "limitations":"Sampled dual-quaternion skin with rigid normal guides; not a full collision solver; inspect actual render"}
