"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { FeedPost } from "@slack-social/shared";

const ThreadSheet = dynamic(
  () => import("./ThreadSheet").then((m) => ({ default: m.ThreadSheet })),
  { ssr: false },
);

type ThreadSheetContextValue = {
  openThread: (post: FeedPost) => void;
};

const ThreadSheetContext = createContext<ThreadSheetContextValue>({
  openThread: () => {},
});

export function ThreadSheetProvider({ children }: { children: ReactNode }) {
  const [post, setPost] = useState<FeedPost | null>(null);

  const openThread = useCallback((next: FeedPost) => {
    setPost(next);
  }, []);

  const close = useCallback(() => setPost(null), []);

  return (
    <ThreadSheetContext.Provider value={{ openThread }}>
      {children}
      {post ? <ThreadSheet post={post} open onClose={close} /> : null}
    </ThreadSheetContext.Provider>
  );
}

export function useOpenThread(): (post: FeedPost) => void {
  return useContext(ThreadSheetContext).openThread;
}
