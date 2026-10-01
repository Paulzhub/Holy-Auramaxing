"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

import type { PreviewState } from "./preview";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("ui-tabs__list", className)} {...props} />;
}

export function TabsTrigger({
  className,
  preview,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger> & { preview?: PreviewState }) {
  return <TabsPrimitive.Trigger className={cn("ui-tabs__trigger", className)} data-preview={preview} {...props} />;
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("ui-tabs__panel", className)} {...props} />;
}
