"""Rebuild CC0 adult display mannequins with Blender 4.2+ and MPFB.

Run from the repo root:
  blender --background --factory-startup --python scripts/build-human-models.py -- /path/to/mpfb2
The MPFB checkout is a build dependency, not a browser dependency. See the asset README.
"""
import bpy
import addon_utils
import sys
import os
import importlib
from mathutils import Vector

source = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
bpy.context.preferences.extensions.repos.new(
    name="Pose Atlas Asset Build", module="pose_atlas_build",
    custom_directory=os.path.join(source, "src"))
package = "bl_ext.pose_atlas_build.mpfb"
addon_utils.enable(package, default_set=True, persistent=False)
HumanService = importlib.import_module(package + ".services.humanservice").HumanService
TargetService = importlib.import_module(package + ".services.targetservice").TargetService
ExportService = importlib.import_module(package + ".services.exportservice").ExportService
out = os.path.abspath("studio/assets/humans")
os.makedirs(out, exist_ok=True)

for sex in ["female", "male"]:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    macro = TargetService.get_default_macro_info_dict()
    # Adult macro targets, blended ancestry, athletic rather than exaggerated anatomy.
    macro.update(gender=0.0 if sex == "female" else 1.0, age=0.5,
                 muscle=0.55 if sex == "female" else 0.9,
                 weight=0.48 if sex == "female" else 0.55,
                 proportions=0.7, cupsize=0.75 if sex == "female" else 0.5,
                 firmness=0.75 if sex == "female" else 0.5)
    body = HumanService.create_human(macro_detail_dict=macro)
    for target, weight in [("breast/nipple-point-decr", 1.0),
                           ("buttocks/buttocks-volume-incr", 0.15 if sex == "female" else 0.0)]:
        TargetService.load_target(body, os.path.join(source, "src/mpfb/data/targets", target + ".target.gz"), weight=weight)
    rig = HumanService.add_builtin_rig(body, "game_engine")
    # Capture evaluated eyes and macro geometry before stripping helper vertices.
    mixed = body.shape_key_add(name="Baked phenotype", from_mix=True)
    coordinates = [v.co.copy() for v in mixed.data]
    eyes = []
    for side in ["l", "r"]:
        group = body.vertex_groups["joint-" + side + "-eye"].index
        points = [coordinates[v.index] for v in body.data.vertices if any(g.group == group for g in v.groups)]
        eyes.append(body.matrix_world @ (sum(points, Vector()) / len(points)))
    body.shape_key_clear()
    for v, co in zip(body.data.vertices, coordinates):
        v.co = co
    ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, remove_helpers=True)

    # Close the eye sockets with untextured display-mannequin eyes, sharing the head bone.
    for center in eyes:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.0115, location=center)
        eye = bpy.context.object
        group = eye.vertex_groups.new(name="head")
        group.add(list(range(len(eye.data.vertices))), 1.0, "REPLACE")
        bpy.ops.object.select_all(action="DESELECT")
        eye.select_set(True)
        body.select_set(True)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.join()

    # A straight A-pose makes zero elbow/knee angles meaningful in the web editor.
    def aim(name, vector):
        bone = rig.pose.bones[name]
        old = bone.matrix.copy()
        delta = (old.to_quaternion() @ Vector((0, 1, 0))).rotation_difference(vector.normalized())
        rotation = delta @ old.to_quaternion()
        matrix = rotation.to_matrix().to_4x4()
        matrix.translation = old.translation
        bone.matrix = matrix
        bpy.context.view_layer.update()

    for side, sign in [("l", 1), ("r", -1)]:
        foot = rig.pose.bones["foot_" + side].matrix.to_quaternion()
        arm_direction = Vector((sign, 0, -1))
        leg_direction = Vector((sign * 0.08, 0, -1))
        aim("upperarm_" + side, arm_direction)
        aim("lowerarm_" + side, arm_direction)
        aim("thigh_" + side, leg_direction)
        aim("calf_" + side, leg_direction)
        bone = rig.pose.bones["foot_" + side]
        location = bone.matrix.translation.copy()
        matrix = foot.to_matrix().to_4x4()
        matrix.translation = location
        bone.matrix = matrix
        bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = body
    for modifier in list(body.modifiers):
        if modifier.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    modifier = body.modifiers.new("Human skin", "ARMATURE")
    modifier.object = rig

    # The asset is a non-textured fitting/display dummy, with no anatomical surface details.
    # Smooth only the small nipple region, keeping the torso silhouette and rig weights intact.
    bpy.context.view_layer.objects.active = body
    if body.vertex_groups.get("nipple"):
        modifier = body.modifiers.new("Fabric surface", "SMOOTH")
        modifier.vertex_group = "nipple"
        modifier.factor = 1.0
        modifier.iterations = 12
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = body.modifiers.new("Surface finish", "SUBSURF")
    modifier.levels = 1
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    material = bpy.data.materials.new("Ivory display mannequin")
    material.diffuse_color = (0.78, 0.75, 0.69, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = material.diffuse_color
    shader.inputs["Roughness"].default_value = 0.58
    body.data.materials.clear()
    body.data.materials.append(material)
    body.name = "Pose Atlas adult " + sex
    rig.name = "MakeHuman game-engine rig"
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, sex + ".glb"),
        export_format="GLB", export_animations=False, export_morph=False,
        export_extras=False, export_texcoords=False)
    print("EXPORTED", sex, len(body.data.vertices), "vertices", len(body.data.polygons), "polygons")
