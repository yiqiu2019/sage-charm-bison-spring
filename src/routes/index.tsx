import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const focus = () => node.focus();
    node.addEventListener("load", focus);
    const onKey = (event: KeyboardEvent) => {
      const target = node.contentWindow;
      if (!target) return;
      target.postMessage(
        { type: "key", down: event.type === "keydown", code: event.code },
        window.location.origin,
      );
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      node.removeEventListener("load", focus);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  return (
    <main className="fixed inset-0 bg-[#2a2118]">
      <iframe
        ref={frame}
        title="赵王城 · 黄昏第一版"
        src="/zhaowangcheng.html"
        className="h-full w-full border-0"
        tabIndex={0}
      />
    </main>
  );
}
