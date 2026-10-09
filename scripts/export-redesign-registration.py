from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'art-source/fighters/redesign-v4/air-registration.json').read_text())
s="// Gerado por export-redesign-registration.py a partir do registro de poses aéreas revisado.\nimport type { FighterId } from '../../types/combat';\nimport type { FighterAnimationId } from '../../types/assets';\n\nconst OFFSETS: Partial<Record<FighterId, Partial<Record<FighterAnimationId, { x: number; y: number }>>>> = "+json.dumps(data,indent=2)+";\n\nexport function redesignPoseOffset(fighter: FighterId, animation: FighterAnimationId): Readonly<{ x: number; y: number }> {\n  return OFFSETS[fighter]?.[animation] ?? { x: 0, y: 0 };\n}\n"
(root/'src/fighters/visual/redesignPoseRegistration.ts').write_text(s,encoding='utf-8')
