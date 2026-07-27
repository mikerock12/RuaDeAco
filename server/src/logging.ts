const encoder = new TextEncoder();

const shortHash = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 6), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

export const logRoomEvent = async (
  event: string,
  roomCode: string,
  fields: Record<string, unknown> = {}
): Promise<void> => {
  console.log(
    JSON.stringify({
      event,
      room: await shortHash(roomCode),
      ...fields
    })
  );
};
