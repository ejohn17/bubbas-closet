"use client";

import {
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  clearListReturn,
  forgetListPosition,
  listUrlOf,
  pendingListReturn,
  rememberListPosition,
  type CatalogFilters,
} from "@/lib/list-return";

/** This page's URL as list-return keys it: path plus query. */
export const useListUrl = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return listUrlOf(pathname, searchParams.toString());
};

/**
 * Wrap a list whose links open other pages. Following one remembers which
 * link it was and where it sat on screen; coming back (a BackToListLink or
 * the browser's Back button) puts that link in the same spot. Leaving any
 * other way (nav, a filter tab) forgets it, so a fresh visit starts at the top.
 */
export function ReturnableList({
  children,
  filters,
}: {
  children: ReactNode;
  filters?: CatalogFilters;
}) {
  const listUrl = useListUrl();
  const ref = useRef<HTMLDivElement>(null);
  const leftByLink = useRef(false);

  // Before paint, so the list never flashes at the top first.
  useLayoutEffect(() => {
    leftByLink.current = false;
    const position = pendingListReturn(listUrl);
    clearListReturn();
    if (position && ref.current) {
      const link = linksTo(ref.current, position.itemPath)[position.linkIndex];
      window.scrollTo(
        0,
        link
          ? link.getBoundingClientRect().top + window.scrollY - position.linkTop
          : position.scrollY,
      );
    }
    return () => {
      if (!leftByLink.current) forgetListPosition(listUrl);
    };
  }, [listUrl]);

  const onClickCapture = (event: MouseEvent) => {
    const container = ref.current;
    const link =
      event.target instanceof Element ? event.target.closest("a[href]") : null;
    // Only plain clicks navigate this tab; new-tab clicks leave the list open.
    if (
      !container ||
      !link ||
      !container.contains(link) ||
      link.getAttribute("target") ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const itemPath = link.getAttribute("href") ?? "";
    leftByLink.current = true;
    rememberListPosition({
      listUrl,
      itemPath,
      linkIndex: linksTo(container, itemPath).indexOf(link),
      linkTop: link.getBoundingClientRect().top,
      scrollY: window.scrollY,
      filters,
    });
  };

  return (
    <div ref={ref} onClickCapture={onClickCapture} className="contents">
      {children}
    </div>
  );
}

const linksTo = (container: HTMLElement, href: string) =>
  Array.from(container.querySelectorAll("a[href]")).filter(
    (link) => link.getAttribute("href") === href,
  );
