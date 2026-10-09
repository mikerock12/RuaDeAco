// Gerado por export-redesign-registration.py a partir do registro de poses aéreas revisado.
import type { FighterId } from '../../types/combat';
import type { FighterAnimationId } from '../../types/assets';

const OFFSETS: Partial<Record<FighterId, Partial<Record<FighterAnimationId, { x: number; y: number }>>>> = {
  "rafa-mare": {
    "airLightBackward": {
      "x": 8,
      "y": -25
    },
    "airHeavyBackward": {
      "x": 0,
      "y": -43
    }
  },
  "noir-reflexo": {
    "airHeavyForward": {
      "x": 0,
      "y": 12
    }
  },
  "astro-riso": {
    "airLightBackward": {
      "x": 0,
      "y": -15
    }
  },
  "dante-sinal": {
    "airLightNeutral": {
      "x": 0,
      "y": -16
    },
    "airLightBackward": {
      "x": 0,
      "y": -10
    }
  },
  "leo-violeta": {
    "airLightNeutral": {
      "x": 0,
      "y": -11
    }
  }
};

export function redesignPoseOffset(fighter: FighterId, animation: FighterAnimationId): Readonly<{ x: number; y: number }> {
  return OFFSETS[fighter]?.[animation] ?? { x: 0, y: 0 };
}
