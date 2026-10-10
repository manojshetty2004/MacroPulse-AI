"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, apiGet } from "@/lib/api";

export type ResourceState<T> =
  | { status: "loading"; data: null; error: null; reload: () => void }
  | { status: "success"; data: T; error: null; reload: () => void }
  | { status: "error"; data: null; error: ApiRequestError; reload: () => void };

/** Load an API resource with cancellation, an explicit loading/error state, and retry. */
export function useApiResource<T>(path: string): ResourceState<T> {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<
    { status: "loading"; data: null; error: null } |
      { status: "success"; data: T; error: null } |
      { status: "error"; data: null; error: ApiRequestError }
  >({ status: "loading", data: null, error: null });
  const reload = useCallback(() => setReloadKey((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null });
    apiGet<T>(path, controller.signal)
      .then((data) => setState({ status: "success", data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const requestError =
          error instanceof ApiRequestError
            ? error
            : new ApiRequestError("The API request failed unexpectedly.", null, "request_error");
        setState({ status: "error", data: null, error: requestError });
      });
    return () => controller.abort();
  }, [path, reloadKey]);

  return { ...state, reload } as ResourceState<T>;
}
