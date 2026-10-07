"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import type { SquareImageCropper as CropperType } from "./square-image-cropper";
import { imageErrorNamespace, type ImageErrorKey, type ImageFormState, type ImageMessages } from "./state";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
const idle: ImageFormState = { status: "idle" };
const noopSubscribe = () => () => {};

export interface SquareImageEditorProps {
  /** Where the copy lives: "profile.avatar" or "groups.picture" (same keys). */
  messages: ImageMessages;
  /** The form field and input id, e.g. "avatar" or "picture". */
  field: string;
  /** Who or what the picture is of, for the initials fallback. */
  name: string;
  src?: string;
  status: "none" | "pending_review" | "ready" | "rejected";
  hasPending: boolean;
  uploadAction: (state: ImageFormState, formData: FormData) => Promise<ImageFormState>;
  removeAction: (state: ImageFormState) => Promise<ImageFormState>;
  /** Group pictures are rounded squares; avatars are circles. */
  shape?: "circle" | "square";
}

function isHeic(file: File): boolean {
  return /hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

// The cropper (dialog, canvas, sliders) loads only once a photo is picked.
type Cropper = typeof CropperType;
const loadCropper = () => import("./square-image-cropper").then((m) => m.SquareImageCropper);

function UploadFallbackButton({ messages }: { messages: ImageMessages }) {
  const t = useTranslations(messages as "profile.avatar");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} loadingLabel={t("uploading")}>
      {t("upload")}
    </Button>
  );
}

function RemoveButton({ messages }: { messages: ImageMessages }) {
  const t = useTranslations(messages as "profile.avatar");
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
export function SquareImageEditor({
  messages,
  field,
  name,
  src,
  status,
  hasPending,
  uploadAction: upload_,
  removeAction: remove_,
  shape = "circle",
}: SquareImageEditorProps) {
  const t = useTranslations(messages as "profile.avatar");
  const tErrors = useTranslations(imageErrorNamespace(messages) as "profile.errors");
  const router = useRouter();
  const [uploadState, uploadAction] = useActionState(upload_, idle);
  const [removeState, removeAction] = useActionState(remove_, idle);
  const [uploading, startUpload] = useTransition();
  // True once JavaScript runs: the cropper replaces the plain upload form.
  const enhanced = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [localError, setLocalError] = useState<ImageErrorKey | "heicUnsupported" | null>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  // Loaded on first use, then kept mounted so closing the dialog can return focus.
  const [Cropper, setCropper] = useState<Cropper | null>(null);
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
      const component = Cropper ?? (await loadCropper());
      setCropper(() => component);
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
      field,
      new File([blob], blob.type === "image/webp" ? `${field}.webp` : `${field}.jpg`, { type: blob.type }),
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
      ? t("uploading")
      : status === "pending_review"
        ? t("pending")
        : status === "rejected"
          ? t("rejected")
          : justReady
            ? t("ready")
            : removeState.status === "removed" && status === "none"
              ? t("removed")
              : undefined;

  return (
    <section className="profile-avatar" aria-labelledby={`${field}-title`}>
      <h2 id={`${field}-title`} className="profile-section__title">
        {t("title")}
      </h2>
      <div className="profile-avatar__row">
        <Avatar name={name} src={src} size="xl" decorative shape={shape} />
        <div className="profile-avatar__controls grid gap-3">
          <form action={uploadAction} className="grid gap-3">
            <div className="ui-field">
              <label className="ui-label" htmlFor={field}>
                {t("choose")}
              </label>
              <p className="ui-hint" id={`${field}-hint`}>
                {t("hint")}
              </p>
              <input
                ref={fileRef}
                id={field}
                name={field}
                type="file"
                accept={ACCEPT}
                className="profile-avatar__file"
                aria-describedby={error ? `${field}-hint ${field}-error` : `${field}-hint`}
                aria-invalid={error ? true : undefined}
                onChange={onPick}
                disabled={uploading}
              />
            </div>
            {enhanced ? null : <UploadFallbackButton messages={messages} />}
          </form>
          {src || hasPending ? (
            <form action={removeAction}>
              <RemoveButton messages={messages} />
            </form>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="ui-error-text" id={`${field}-error`} role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error === "heicUnsupported" ? t("heicUnsupported") : tErrors(error)}</span>
        </p>
      ) : null}
      <p className="profile-avatar__status" role="status">
        {message}
      </p>

      {Cropper ? <Cropper messages={messages} image={image} onCancel={closeCropper} onConfirm={upload} /> : null}
    </section>
  );
}
