import { ROOM_CODE_LENGTH } from "./config";
import { ApiError } from "./errors";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;

export const createRoomCode = (): string => {
  const values = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(values);
  let result = "";
  for (const value of values) {
    result += ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length];
  }
  return result;
};

export const normalizeRoomCode = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(normalized)) {
    throw new ApiError(400, "invalid_room_code", "Código de sala inválido.");
  }
  return normalized;
};
