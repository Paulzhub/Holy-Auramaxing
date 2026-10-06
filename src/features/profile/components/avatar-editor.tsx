"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import type { AvatarErrorKey, AvatarFormState } from "../profile-schema";

import type { AvatarCropper as AvatarCropperType } from "./avatar-cropper";
import { removeAvatarAction, uploadAvatarAction } from "../server/profile-actions";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
const idle: AvatarFormState = { status: "idle" };
const noopSubscribe = () => () => {};

export interface AvatarEditorProps {
  name: string;
  src?: string;
  status: "none" | "pending_review" | "ready" | "rejected";
  hasPending: boolean;
}

function isHeic(file: File): boolean {
  return /hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

// The cropper (dialog, canvas, sliders) loads only once a photo is picked.
type Cropper = typeof AvatarCropperType;
const loadCropper = () => import("./avatar-cropper").then((m) => m.AvatarCropper);

function UploadFallbackButton() {
  const t = useTranslations("profile.avatar");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} loadingLabel={t("uploading")}>
      {t("upload")}
    </Button>
  );
}

function RemoveButton() {
  const t = useTranslations("profile.avatar");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" loading={pending} loadingLabel={t("removing")}>
      {t("remove")}
    </Button>
  );
}

/**
 * Photo picker with an on-device square crop (CLAUDE.md §7.3). The browser
 * crops and shrinks the photo; the server still checks, re-encodes and
 * strips it, and has it screened. Without JavaScript the file input and an
 * Upload button post the original file instead.
 */
export function AvatarEditor({ name, src, status, hasPending }: AvatarEditorProps) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [uploadState, uploadAction] = useActionState(uploadAvatarAction, idle);
  const [removeState, removeAction] = useActionState(removeAvatarAction, idle);
  const [uploading, startUpload] = useTransition();
  // True once JavaScript runs: the cropper replaces the plain upload form.
  const enhanced = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [localError, setLocalError] = useState<AvatarErrorKey | "heicUnsupported" | null>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  // Loaded on first use, then kept mounted so closing the dialog can return focus.
  const [AvatarCropper, setAvatarCropper] = useState<Cropper | null>(null);
  const [justReady, setJustReady] = useState(false);
  const [seenStatus, setSeenStatus] = useState(status);
  if (status !== seenStatus) {
    // The photo being checked has just been approved.
    setJustReady(seenStatus === "pending_review" && status === "ready");
    setSeenStatus(status);
  }
  const fileRef = useRef<HTMLInputElement>(null);

  // While a photo is being checked, look again every few seconds.
  useEffect(() => {
    if (status !== "pending_review") return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 10) window.clearInterval(timer);
      else router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status, router]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    if (!enhanced) return;
    const file = event.target.files?.[0];
    setLocalError(null);
    setJustReady(false);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalError("avatarSize");
      event.target.value = "";
      return;
    }
    try {
      // Applies the EXIF orientation; Safari also decodes HEIC here.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (Math.min(bitmap.width, bitmap.height) < 64) {
        setLocalError("avatarTooSmall");
        event.target.value = "";
        return;
      }
      const component = AvatarCropper ?? (await loadCropper());
      setAvatarCropper(() => component);
      setImage(bitmap);
    } catch {
      setLocalError(isHeic(file) ? "heicUnsupported" : "avatarUnreadable");
      event.target.value = "";
    }
  }

  function closeCropper() {
    image?.close();
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function upload(blob: Blob | null) {
    closeCropper();
    if (!blob) {
      setLocalError("avatarUnreadable");
      return;
    }
    const data = new FormData();
    data.set(
      "avatar",
      new File([blob], blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg", { type: blob.type }),
    );
    startUpload(() => uploadAction(data));
  }

  const error =
    localError ??
    (uploadState.status === "error" ? uploadState.error : undefined) ??
    (removeState.status === "error" ? removeState.error : undefined);
  const message = error
    ? undefined
    : uploading
      ? t("avatar.uploading")
      : status === "pending_review"
        ? t("avatar.pending")
        : status === "rejected"
          ? t("avatar.rejected")
          : justReady
            ? t("avatar.ready")
            : removeState.status === "removed" && status === "none"
              ? t("avatar.removed")
              : undefined;

  return (
    <section className="profile-avatar" aria-labelledby="avatar-title">
      <h2 id="avatar-title" className="profile-section__title">
        {t("avatar.title")}
      </h2>
      <div className="profile-avatar__row">
        <Avatar name={name} src={src} size="xl" decorative />
        <div className="profile-avatar__controls grid gap-3">
          <form action={uploadAction} className="grid gap-3">
            <div className="ui-field">
              <label className="ui-label" htmlFor="avatar">
                {t("avatar.choose")}
              </label>
              <p className="ui-hint" id="avatar-hint">
                {t("avatar.hint")}
              </p>
              <input
                ref={fileRef}
                id="avatar"
                name="avatar"
                type="file"
                accept={ACCEPT}
                className="profile-avatar__file"
                aria-describedby={error ? "avatar-hint avatar-error" : "avatar-hint"}
                aria-invalid={error ? true : undefined}
                onChange={onPick}
                disabled={uploading}
              />
            </div>
            {enhanced ? null : <UploadFallbackButton />}
          </form>
          {src || hasPending ? (
            <form action={removeAction}>
              <RemoveButton />
            </form>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="ui-error-text" id="avatar-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{t(error === "heicUnsupported" ? "avatar.heicUnsupported" : `errors.${error}`)}</span>
        </p>
      ) : null}
      <p className="profile-avatar__status" role="status">
        {message}
      </p>

      {AvatarCropper ? <AvatarCropper image={image} onCancel={closeCropper} onConfirm={upload} /> : null}
    </section>
  );
}
