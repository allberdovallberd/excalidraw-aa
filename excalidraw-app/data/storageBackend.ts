import { reconcileElements } from "@excalidraw/excalidraw";
import { MIME_TYPES, toBrandedType } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { getAuthHeaders } from "./sessionToken";

import { getSyncableElements } from ".";

import type { SyncableExcalidrawElement } from ".";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const getStorageBackendBaseUrl = () => {
  if (import.meta.env.VITE_APP_STORAGE_BACKEND_URL) {
    return import.meta.env.VITE_APP_STORAGE_BACKEND_URL.replace(/\/+$/, "");
  }
  const wsUrl = import.meta.env.VITE_APP_WS_SERVER_URL;
  if (wsUrl.startsWith("ws://")) {
    return wsUrl.replace("ws://", "http://").replace(/\/+$/, "");
  }
  if (wsUrl.startsWith("wss://")) {
    return wsUrl.replace("wss://", "https://").replace(/\/+$/, "");
  }
  if (wsUrl.startsWith("http://") || wsUrl.startsWith("https://")) {
    return wsUrl.replace(/\/+$/, "");
  }
  return "http://localhost:3002";
};

const STORAGE_BACKEND_BASE_URL = getStorageBackendBaseUrl();

const STORAGE_BACKEND_ERRORS = {
  ROOM_STOPPED: "ROOM_STOPPED",
} as const;

export const isRoomStoppedError = (error: unknown) =>
  error instanceof Error &&
  error.message === STORAGE_BACKEND_ERRORS.ROOM_STOPPED;

type LocalStoredScene = {
  sceneVersion: number;
  iv: string;
  ciphertext: string;
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);

  return { ciphertext: new Uint8Array(encryptedBuffer), iv };
};

const decryptElements = async (
  data: LocalStoredScene,
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const ciphertext = fromBase64(data.ciphertext);
  const iv = fromBase64(data.iv);

  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};

class LocalSceneVersionCache {
  private static cache = new WeakMap<Socket, number>();
  static get = (socket: Socket) => {
    return LocalSceneVersionCache.cache.get(socket);
  };
  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    LocalSceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

const getSceneEndpoint = (roomId: string) =>
  `${STORAGE_BACKEND_BASE_URL}/api/storage/scenes/${encodeURIComponent(
    roomId,
  )}`;

const getFileEndpoint = (prefix: string, id: string) =>
  `${STORAGE_BACKEND_BASE_URL}/api/storage/file?prefix=${encodeURIComponent(
    prefix,
  )}&id=${encodeURIComponent(id)}`;

const readStoredScene = async (
  roomId: string,
): Promise<LocalStoredScene | null> => {
  const response = await fetch(getSceneEndpoint(roomId), {
    headers: getAuthHeaders(),
  });
  if (response.status === 404) {
    return null;
  }
  if (response.status === 410) {
    throw new Error(STORAGE_BACKEND_ERRORS.ROOM_STOPPED);
  }
  if (!response.ok) {
    throw new Error("Failed to load scene");
  }
  return response.json();
};

const writeStoredScene = async (roomId: string, scene: LocalStoredScene) => {
  const response = await fetch(getSceneEndpoint(roomId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(scene),
  });
  if (response.status === 410) {
    throw new Error(STORAGE_BACKEND_ERRORS.ROOM_STOPPED);
  }
  if (!response.ok) {
    throw new Error("Failed to save scene");
  }
};

export const loadStorageBackend = async () => null;

export const isSavedToStorage = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);

    return LocalSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveFilesToStorage = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const binary = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer;
        const response = await fetch(getFileEndpoint(prefix, id), {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            ...getAuthHeaders(),
          },
          body: binary,
        });
        if (!response.ok) {
          throw new Error(`Failed to save file ${id}`);
        }
        savedFiles.push(id);
      } catch (error) {
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

const createStoredSceneDocument = async (
  elements: readonly SyncableExcalidrawElement[],
  roomKey: string,
) => {
  const sceneVersion = getSceneVersion(elements);
  const { ciphertext, iv } = await encryptElements(roomKey, elements);
  return {
    sceneVersion,
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
  } as LocalStoredScene;
};

export const saveToStorage = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  if (
    // bail if no room exists as there's nothing we can do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSavedToStorage(portal, elements)
  ) {
    return null;
  }

  const previousStoredScene = await readStoredScene(roomId);

  let reconciledElements = elements;
  if (previousStoredScene) {
    const prevStoredElements = getSyncableElements(
      restoreElements(
        await decryptElements(previousStoredScene, roomKey),
        null,
      ),
    );
    reconciledElements = getSyncableElements(
      reconcileElements(
        elements,
        prevStoredElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
        appState,
      ),
    );
  }

  const storedScene = await createStoredSceneDocument(
    reconciledElements,
    roomKey,
  );
  await writeStoredScene(roomId, storedScene);

  const storedElements = getSyncableElements(
    restoreElements(await decryptElements(storedScene, roomKey), null),
  );

  LocalSceneVersionCache.set(socket, storedElements);

  return toBrandedType<RemoteExcalidrawElement[]>(storedElements);
};

export const loadFromStorage = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const storedScene = await readStoredScene(roomId);
  if (!storedScene) {
    return null;
  }

  const elements = getSyncableElements(
    restoreElements(await decryptElements(storedScene, roomKey), null, {
      deleteInvisibleElements: true,
    }),
  );

  if (socket) {
    LocalSceneVersionCache.set(socket, elements);
  }

  return elements;
};

export const loadFilesFromStorage = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const response = await fetch(getFileEndpoint(prefix, id), {
          headers: getAuthHeaders(),
        });
        if (response.status < 400) {
          const arrayBuffer = await response.arrayBuffer();

          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            {
              decryptionKey,
            },
          );

          const dataURL = new TextDecoder().decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id,
            dataURL,
            created: metadata?.created || Date.now(),
            lastRetrieved: metadata?.created || Date.now(),
          });
        } else {
          erroredFiles.set(id, true);
        }
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};
