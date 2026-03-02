import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  copyIcon,
  playerPlayIcon,
  playerStopFilledIcon,
  share,
  shareIOS,
  shareWindows,
} from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useCopyStatus } from "@excalidraw/excalidraw/hooks/useCopiedIndicator";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { KEYS, getFrame } from "@excalidraw/common";
import { useEffect, useRef, useState } from "react";

import { atom, useAtom, useAtomValue } from "../app-jotai";
import {
  activeRoomLinkAtom,
  roomDefaultJoinRoleAtom,
  roomParticipantsAtom,
  roomRoleAtom,
} from "../collab/Collab";

import "./ShareDialog.scss";
import { QRCode } from "./QRCode";

import type { CollabAPI } from "../collab/Collab";
import type { RoomUserRole } from "../collab/Collab";

type ShareDialogType = "collaborationOnly";

export const shareDialogStateAtom = atom<
  { isOpen: false } | { isOpen: true; type: ShareDialogType }
>({ isOpen: false });

const getShareIcon = () => {
  const navigator = window.navigator as any;
  const isAppleBrowser = /Apple/.test(navigator.vendor);
  const isWindowsBrowser = navigator.appVersion.indexOf("Win") !== -1;

  if (isAppleBrowser) {
    return shareIOS;
  } else if (isWindowsBrowser) {
    return shareWindows;
  }

  return share;
};

export type ShareDialogProps = {
  collabAPI: CollabAPI | null;
  handleClose: () => void;
  type: ShareDialogType;
};

const ActiveRoomDialog = ({
  collabAPI,
  activeRoomLink,
  handleClose,
  roomRole,
  defaultJoinRole,
  participants,
}: {
  collabAPI: CollabAPI;
  activeRoomLink: string;
  handleClose: () => void;
  roomRole: RoomUserRole;
  defaultJoinRole: "editor" | "viewer";
  participants: ReturnType<CollabAPI["getRoomParticipants"]>;
}) => {
  const { t } = useI18n();
  const [, setJustCopied] = useState(false);
  const timerRef = useRef<number>(0);
  const ref = useRef<HTMLInputElement>(null);
  const isShareSupported = "share" in navigator;
  const { onCopy, copyStatus } = useCopyStatus();
  const [bulkRole, setBulkRole] = useState<"editor" | "viewer">(
    defaultJoinRole,
  );
  useEffect(() => {
    setBulkRole(defaultJoinRole);
  }, [defaultJoinRole]);

  const copyRoomLink = async () => {
    try {
      await copyTextToSystemClipboard(activeRoomLink);
    } catch (e) {
      collabAPI.setCollabError(t("errors.copyToSystemClipboardFailed"));
    }

    setJustCopied(true);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setJustCopied(false);
    }, 3000);

    ref.current?.select();
  };

  const shareRoomLink = async () => {
    try {
      await navigator.share({
        title: t("roomDialog.shareTitle"),
        text: t("roomDialog.shareTitle"),
        url: activeRoomLink,
      });
    } catch (error: any) {
      // Just ignore.
    }
  };

  const getParticipantRoleLabel = (role: RoomUserRole) => {
    if (role === "owner") {
      return t("roomDialog.role_owner");
    }
    if (role === "editor") {
      return t("roomDialog.role_editor");
    }
    return t("roomDialog.role_viewer");
  };

  return (
    <>
      <h3 className="ShareDialog__active__header">
        {t("labels.liveCollaboration").replace(/\./g, "")}
      </h3>
      <TextField
        defaultValue={collabAPI.getUsername()}
        placeholder={t("roomDialog.yourName")}
        label={t("roomDialog.yourName")}
        onChange={collabAPI.setUsername}
        onKeyDown={(event) => event.key === KEYS.ENTER && handleClose()}
      />
      <div className="ShareDialog__active__linkRow">
        <TextField
          ref={ref}
          label={t("roomDialog.linkLabel")}
          readonly
          fullWidth
          value={activeRoomLink}
        />
        {isShareSupported && (
          <FilledButton
            size="large"
            variant="icon"
            label={t("roomDialog.shareButton")}
            icon={getShareIcon()}
            className="ShareDialog__active__share"
            onClick={shareRoomLink}
          />
        )}
        <FilledButton
          size="large"
          label={t("buttons.copyLink")}
          icon={copyIcon}
          status={copyStatus}
          onClick={() => {
            copyRoomLink();
            onCopy();
          }}
        />
      </div>
      <QRCode value={activeRoomLink} />
      <div className="ShareDialog__active__description">
        <p>
          <span
            role="img"
            aria-hidden="true"
            className="ShareDialog__active__description__emoji"
          >
            🔒{" "}
          </span>
          {t("roomDialog.desc_privacy")}
        </p>
        <p>{t("roomDialog.desc_exitSession")}</p>
      </div>
      <div className="ShareDialog__active__roles">
        <div className="ShareDialog__active__roles__title">
          {t("roomDialog.sessionRoles")}
        </div>
        {roomRole === "owner" && (
          <div className="ShareDialog__active__roles__bulk">
            <select
              className="ShareDialog__active__roles__select"
              value={bulkRole}
              onChange={(event) =>
                setBulkRole(event.target.value as "editor" | "viewer")
              }
            >
              <option value="editor">{t("roomDialog.role_editor")}</option>
              <option value="viewer">{t("roomDialog.role_viewer")}</option>
            </select>
            <FilledButton
              size="large"
              label={t("roomDialog.applyAllRoles")}
              onClick={() => collabAPI.setAllParticipantsRole(bulkRole)}
            />
          </div>
        )}
        {participants.map((participant) => {
          return (
            <div
              key={participant.socketId}
              className="ShareDialog__active__roles__row"
            >
              <div className="ShareDialog__active__roles__user">
                {participant.username || participant.socketId}
              </div>
              {roomRole === "owner" && !participant.isCurrentUser ? (
                <select
                  className="ShareDialog__active__roles__select"
                  value={participant.role}
                  onChange={(event) =>
                    collabAPI.setParticipantRole(
                      participant.socketId,
                      event.target.value as "editor" | "viewer",
                    )
                  }
                >
                  <option value="editor">{t("roomDialog.role_editor")}</option>
                  <option value="viewer">{t("roomDialog.role_viewer")}</option>
                </select>
              ) : (
                <div className="ShareDialog__active__roles__badge">
                  {getParticipantRoleLabel(participant.role)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {roomRole === "owner" && (
        <div className="ShareDialog__active__actions">
          <FilledButton
            size="large"
            variant="outlined"
            color="danger"
            label={t("roomDialog.button_stopSession")}
            icon={playerStopFilledIcon}
            onClick={() => {
              const shouldStop = window.confirm(
                t("roomDialog.stopSessionConfirm"),
              );
              if (!shouldStop) {
                return;
              }
              trackEvent("share", "room closed");
              collabAPI.stopSessionForAll();
              if (!collabAPI.isCollaborating()) {
                handleClose();
              }
            }}
          />
        </div>
      )}
    </>
  );
};

const ShareDialogPicker = (props: ShareDialogProps) => {
  const { t } = useI18n();

  const { collabAPI } = props;
  const [defaultJoinRole, setDefaultJoinRole] = useState<"editor" | "viewer">(
    "viewer",
  );

  const startCollabJSX = collabAPI ? (
    <>
      <div className="ShareDialog__picker__header">
        {t("labels.liveCollaboration").replace(/\./g, "")}
      </div>

      <div className="ShareDialog__picker__description">
        <div style={{ marginBottom: "1em" }}>{t("roomDialog.desc_intro")}</div>
        {t("roomDialog.desc_privacy")}
      </div>

      <div className="ShareDialog__picker__button">
        <div className="ShareDialog__picker__joinRole">
          <button
            type="button"
            className={`ShareDialog__picker__joinRoleButton ${
              defaultJoinRole === "viewer" ? "is-active" : ""
            }`}
            onClick={() => setDefaultJoinRole("viewer")}
          >
            {t("roomDialog.role_viewer")}
          </button>
          <button
            type="button"
            className={`ShareDialog__picker__joinRoleButton ${
              defaultJoinRole === "editor" ? "is-active" : ""
            }`}
            onClick={() => setDefaultJoinRole("editor")}
          >
            {t("roomDialog.role_editor")}
          </button>
        </div>
        <FilledButton
          size="large"
          label={t("roomDialog.button_startSession")}
          icon={playerPlayIcon}
          onClick={() => {
            trackEvent("share", "room creation", `ui (${getFrame()})`);
            collabAPI.startCollaboration(null, {
              defaultJoinRole,
            });
          }}
        />
      </div>
    </>
  ) : null;
  return <>{startCollabJSX}</>;
};

const ShareDialogInner = (props: ShareDialogProps) => {
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);
  const roomRole = useAtomValue(roomRoleAtom);
  const roomDefaultJoinRole = useAtomValue(roomDefaultJoinRoleAtom);
  useAtomValue(roomParticipantsAtom);

  return (
    <Dialog size="small" onCloseRequest={props.handleClose} title={false}>
      <div className="ShareDialog">
        {props.collabAPI && activeRoomLink ? (
          <ActiveRoomDialog
            collabAPI={props.collabAPI}
            activeRoomLink={activeRoomLink}
            handleClose={props.handleClose}
            roomRole={roomRole}
            defaultJoinRole={roomDefaultJoinRole}
            participants={props.collabAPI.getRoomParticipants()}
          />
        ) : (
          <ShareDialogPicker {...props} />
        )}
      </div>
    </Dialog>
  );
};

export const ShareDialog = (props: { collabAPI: CollabAPI | null }) => {
  const [shareDialogState, setShareDialogState] = useAtom(shareDialogStateAtom);

  const { openDialog } = useUIAppState();

  useEffect(() => {
    if (openDialog) {
      setShareDialogState({ isOpen: false });
    }
  }, [openDialog, setShareDialogState]);

  if (!shareDialogState.isOpen) {
    return null;
  }

  return (
    <ShareDialogInner
      handleClose={() => setShareDialogState({ isOpen: false })}
      collabAPI={props.collabAPI}
      type={shareDialogState.type}
    />
  );
};
