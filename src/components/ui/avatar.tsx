"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : words;
  return letters
    .map((word) => Array.from(word ?? "")[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** True when the name is already shown next to the avatar. */
  decorative?: boolean;
  /** Circles for people, rounded squares for groups. */
  shape?: "circle" | "square";
  className?: string;
}

/** Shows the photo, or initials when there is no photo or it fails to load. */
export function Avatar({ name, src, size = "md", decorative = false, shape = "circle", className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const showImage = Boolean(src) && !failed;

  // An image can fail before React hydrates and attaches onError; catch that case.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  const classes = cn("ui-avatar", `ui-avatar--${size}`, shape === "square" && "ui-avatar--square", className);

  if (showImage) {
    return (
      <span className={classes}>
        {/* Avatars are small, pre-sized WebP files from our own storage; next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={decorative ? "" : name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return decorative ? (
    <span className={classes} aria-hidden="true">
      {initialsFor(name)}
    </span>
  ) : (
    <span className={classes} role="img" aria-label={name}>
      <span aria-hidden="true">{initialsFor(name)}</span>
    </span>
  );
}
