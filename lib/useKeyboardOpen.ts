import { useEffect, useState } from "react";

const KEYBOARD_THRESHOLD = 120;

export function useKeyboardOpen(): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const heightDifference = window.innerHeight - viewport.height;
      setKeyboardOpen(heightDifference > KEYBOARD_THRESHOLD);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return keyboardOpen;
}
