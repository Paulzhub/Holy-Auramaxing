"use client";

import { SquareImageEditor } from "@/components/image-picker/square-image-editor";

import { removeAvatarAction, uploadAvatarAction } from "../server/profile-actions";

export interface AvatarEditorProps {
  name: string;
  src?: string;
  status: "none" | "pending_review" | "ready" | "rejected";
  hasPending: boolean;
}

/**
 * Photo picker with an on-device square crop (CLAUDE.md §7.3). The browser
 * crops and shrinks the photo; the server still checks, re-encodes and
 * strips it, and has it screened. Shared with group pictures (D-036).
 */
export function AvatarEditor(props: AvatarEditorProps) {
  return (
    <SquareImageEditor
      {...props}
      messages="profile.avatar"
      field="avatar"
      uploadAction={uploadAvatarAction}
      removeAction={removeAvatarAction}
    />
  );
}
