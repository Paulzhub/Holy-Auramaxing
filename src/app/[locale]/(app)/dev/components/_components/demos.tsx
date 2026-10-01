"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ReactionBar, type ReactionKind, type ReactionState } from "@/components/ui/reaction-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast, type ToastTone } from "@/components/ui/toast";

export function DialogDemo() {
  const t = useTranslations("dev.dialog");
  const tUi = useTranslations("ui");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t("open")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("heading")}
        description={t("body")}
        closeLabel={tUi("close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => setOpen(false)}>{t("confirm")}</Button>
          </>
        }
      />
    </>
  );
}

export function SheetDemo() {
  const t = useTranslations("dev.sheet");
  const tUi = useTranslations("ui");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t("open")}
      </Button>
      <Dialog
        variant="sheet"
        open={open}
        onOpenChange={setOpen}
        title={t("heading")}
        description={t("body")}
        closeLabel={tUi("close")}
        footer={<Button onClick={() => setOpen(false)}>{t("action")}</Button>}
      />
    </>
  );
}

export function TabsDemo() {
  const t = useTranslations("dev.tabs");
  const tabs = ["consistency", "level", "streak"] as const;
  return (
    <Tabs defaultValue="consistency">
      <TabsList aria-label={t("label")}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {t(tab)}
          </TabsTrigger>
        ))}
        <TabsTrigger value="archived" disabled>
          {t("archived")}
        </TabsTrigger>
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab} value={tab}>
          <p>{t("panel", { tab: t(tab) })}</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function ToastDemo() {
  const t = useTranslations("dev.toast");
  const { show } = useToast();
  const fire = (tone: ToastTone) => {
    const key = tone === "error" ? "error" : tone === "success" ? "success" : "info";
    show({ tone, title: t(`${key}Title`), description: t(`${key}Body`) });
  };
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => fire("info")}>
        {t("showInfo")}
      </Button>
      <Button variant="secondary" onClick={() => fire("success")}>
        {t("showSuccess")}
      </Button>
      <Button variant="secondary" onClick={() => fire("error")}>
        {t("showError")}
      </Button>
    </div>
  );
}

const initialReactions: ReactionState[] = [
  { kind: "pray", count: 4, mine: true },
  { kind: "heart", count: 2, mine: false },
  { kind: "fire", count: 0, mine: false },
  { kind: "strong", count: 1, mine: false },
  { kind: "dove", count: 0, mine: false },
];

export function ReactionDemo() {
  const [reactions, setReactions] = useState(initialReactions);
  const toggle = (kind: ReactionKind) =>
    setReactions((items) =>
      items.map((r) => (r.kind === kind ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r)),
    );
  return <ReactionBar reactions={reactions} onToggle={toggle} />;
}

export function ReactionStatic(props: Parameters<typeof ReactionBar>[0]) {
  return <ReactionBar {...props} />;
}
