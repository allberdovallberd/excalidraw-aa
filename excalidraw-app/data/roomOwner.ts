const ROOM_OWNER_CLAIMS_KEY = "excalidraw-room-owner-claims";

const generateClaim = () => {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const readClaims = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(ROOM_OWNER_CLAIMS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.error(error);
  }
  return {};
};

const writeClaims = (claims: Record<string, string>) => {
  try {
    localStorage.setItem(ROOM_OWNER_CLAIMS_KEY, JSON.stringify(claims));
  } catch (error) {
    console.error(error);
  }
};

export const getRoomOwnerClaim = (roomId: string) => {
  const claims = readClaims();
  return claims[roomId] || null;
};

export const ensureRoomOwnerClaim = (roomId: string) => {
  const claims = readClaims();
  if (!claims[roomId]) {
    claims[roomId] = generateClaim();
    writeClaims(claims);
  }
  return claims[roomId];
};

export const clearRoomOwnerClaim = (roomId: string) => {
  const claims = readClaims();
  if (claims[roomId]) {
    delete claims[roomId];
    writeClaims(claims);
  }
};
