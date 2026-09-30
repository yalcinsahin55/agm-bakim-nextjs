import { useEffect, useState } from "react";

const STORAGE_KEY = "agm-sidebar-collapsed";
const EVENT_NAME = "agm-sidebar:change";

export function useSidebarCollapsed(): [boolean, (value: boolean | ((current: boolean) => boolean)) => void] {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    setCollapsedState(window.localStorage.getItem(STORAGE_KEY) === "1");
    const sync = () => setCollapsedState(window.localStorage.getItem(STORAGE_KEY) === "1");
    window.addEventListener(EVENT_NAME, sync);
    return () => window.removeEventListener(EVENT_NAME, sync);
  }, []);

  const setCollapsed = (value: boolean | ((current: boolean) => boolean)) => {
    setCollapsedState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      window.dispatchEvent(new Event(EVENT_NAME));
      return next;
    });
  };

  return [collapsed, setCollapsed];
}
