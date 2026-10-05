"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { CROP_OUTPUT, cropRect, MAX_ZOOM, MIN_ZOOM } from "../avatar/crop";

/** Draws the crop onto a canvas, for the preview and the upload alike. */
function draw(canvas: HTMLCanvasElement, image: ImageBitmap, zoom: number, panX: number, panY: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const r = cropRect(image.width, image.height, canvas.width, zoom, panX, panY);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, r.x, r.y, r.width, r.height);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(
      (webp) => {
        // Older Safari can't encode WebP and silently returns PNG; JPEG is smaller.
        if (webp && webp.type === "image/webp") resolve(webp);
        else canvas.toBlob(resolve, "image/jpeg", 0.92);
      },
      "image/webp",
      0.92,
    ),
  );
}

function Slider({
  id,
  label,
  min,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="profile-cropper__slider"
      />
    </div>
  );
}

/**
 * The square crop dialog. Loaded only when someone picks a photo, so it
 * costs nothing on page load. Sliders, not dragging, so it works with a
 * keyboard, a switch or a screen reader (WCAG 2.5.7).
 */
export function AvatarCropper({
  image,
  onCancel,
  onConfirm,
}: {
  image: ImageBitmap | null;
  onCancel: () => void;
  onConfirm: (blob: Blob | null) => void;
}) {
  const t = useTranslations("profile.avatar");
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [seenImage, setSeenImage] = useState(image);
  if (image !== seenImage) {
    // A new photo starts centred and unzoomed.
    setSeenImage(image);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (image && canvasRef.current) draw(canvasRef.current, image, zoom, panX, panY);
  }, [image, zoom, panX, panY]);

  async function confirm() {
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUTPUT;
    canvas.height = CROP_OUTPUT;
    draw(canvas, image, zoom, panX, panY);
    onConfirm(await toBlob(canvas));
  }

  return (
    <Dialog
      open={image !== null}
      onOpenChange={(open) => (open ? undefined : onCancel())}
      title={t("cropTitle")}
      description={t("cropDescription")}
      closeLabel={t("close")}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={confirm}>
            {t("usePhoto")}
          </Button>
        </>
      }
    >
      <div className="profile-cropper">
        <div className="profile-cropper__frame">
          <canvas ref={canvasRef} width={512} height={512} className="profile-cropper__canvas" aria-hidden="true" />
        </div>
        <Slider
          id="crop-zoom"
          label={t("zoom")}
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          value={zoom * 100}
          onChange={(v) => setZoom(v / 100)}
        />
        <Slider id="crop-x" label={t("horizontal")} min={-100} max={100} value={panX} onChange={setPanX} />
        <Slider id="crop-y" label={t("vertical")} min={-100} max={100} value={panY} onChange={setPanY} />
      </div>
    </Dialog>
  );
}
