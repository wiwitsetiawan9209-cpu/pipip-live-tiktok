# Avatar asset inventory

Last inspected: 2026-09-25. Re-run `node scripts/inventory-avatar-assets.mjs` from the project root to refresh the machine-readable inventory. The command reads only the `Avatar/` source tree, ignores symbolic links, and prints JSON to stdout; it does not edit, convert, move, or overwrite source files.

## Folder boundaries

| Area | Location | Current status | Rule |
|---|---|---|---|
| SOURCE | `Avatar/` | Contains seven JPEG images listed below | Read-only; never overwrite original assets |
| WORKING | `Avatar/WORKING/` | Not created | Future copies/derived work only |
| EXPORT | `Avatar/EXPORT/` | Not created | Future runtime-ready exports only |

No file compatibility is inferred from a name alone. JPEG signature is verified. An image may be a texture reference candidate but is not confirmed as a texture until materials/model references are inspected. The inventory does not parse 3D internals; rig, animation, shape keys/blendshapes, and materials remain UNKNOWN where a model file might contain them.

## Current SOURCE inventory

| Filename | Extension | Size | Format | Possible rig | Animation | Blendshape | Texture | Material |
|---|---:|---:|---|---|---|---|---|---|
| `Gemini_Generated_Image_5yqxcd5yqxcd5yqx.jpg` | `.jpg` | 641,909 B | JPEG signature verified | No supported model format | No supported model format | No supported model format | Image candidate, unconfirmed | UNKNOWN |
| `Gemini_Generated_Image_67ojvw67ojvw67oj.jpg` | `.jpg` | 526,349 B | JPEG signature verified | No supported model format | No supported model format | No supported model format | Image candidate, unconfirmed | UNKNOWN |
| `Gemini_Generated_Image_cs1hacs1hacs1hac.jpg` | `.jpg` | 744,097 B | JPEG signature verified | No supported model format | No supported model format | No supported model format | Image candidate, unconfirmed | UNKNOWN |
| `Gemini_Generated_Image_jyerwujyerwujyer.jpg` | `.jpg` | 589,872 B | JPEG signature verified | No supported model format | No supported model format | No supported model format | Image candidate, unconfirmed | UNKNOWN |
| `Gemini_Generated_Image_lq4puulq4puulq4p.jpg` | `.jpg` | 646,995 B | JPEG signature verified | No supported model format | No supported model format | No supported model format | Image candidate, unconfirmed | UNKNOWN |
| `Gemini_Generated_Image_nzavyynzavyynzav.jpg` | `.jpg` | 532,437 B | JPEG signature verified | No supported model format | No supported model format | No supported model format | Image candidate, unconfirmed | UNKNOWN |
| `Gemini_Generated_Image_scsz9kscsz9kscsz.jpg` | `.jpg` | 658,263 B | JPEG signature verified | No supported model format | No supported model format | No supported model format | Image candidate, unconfirmed | UNKNOWN |

The inspected folder contains no `.blend`, `.fbx`, `.obj`, `.glb`, or `.gltf` model candidate. It contains no direct evidence of armatures, rigs, animation clips, materials, or shape keys. This report is a file inventory, not a visual/structural inspection of JPEG contents.
