"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export interface UsePageDataResult<T> {
  data: T;
  loading: boolean;
  error: string;
  refreshing: boolean;
  reload: () => Promise<void>;
}

export function usePageData<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  initialValue: T,
  deps: DependencyList,
  errorMessage = "Veriler yüklenemedi. Lütfen tekrar deneyin.",
): UsePageDataResult<T> {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const aliveRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const loaderRef = useRef(loader);
  const errorMessageRef = useRef(errorMessage);
  const dependencyKey = deps.map((dependency) => String(dependency)).join("\u001f");

  useEffect(() => {
    loaderRef.current = loader;
    errorMessageRef.current = errorMessage;
  }, [loader, errorMessage]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  const reload = useCallback(async () => {
    void dependencyKey;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError("");
    setRefreshing(true);
    try {
      const result = await loaderRef.current(controller.signal);
      if (aliveRef.current) setData(result);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      console.error(errorMessageRef.current, loadError);
      if (aliveRef.current) setError(errorMessageRef.current);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dependencyKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, refreshing, error, reload };
}
