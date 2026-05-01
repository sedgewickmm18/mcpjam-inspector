import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "mcp-inspector-selected-model";
const MULTI_MODEL_STORAGE_KEY = "mcp-inspector-selected-models";
const MULTI_MODEL_ENABLED_STORAGE_KEY = "mcp-inspector-multi-model-enabled";

function normalizeSelectedModelIds(modelIds: string[]): string[] {
  const uniqueModelIds: string[] = [];
  const seen = new Set<string>();

  for (const modelId of modelIds) {
    if (typeof modelId !== "string") {
      continue;
    }

    const trimmed = modelId.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    uniqueModelIds.push(trimmed);
  }

  return uniqueModelIds;
}

export interface UsePersistedModelReturn {
  selectedModelId: string | null;
  setSelectedModelId: (modelId: string | null) => void;
  selectedModelIds: string[];
  setSelectedModelIds: (modelIds: string[]) => void;
  multiModelEnabled: boolean;
  setMultiModelEnabled: (enabled: boolean) => void;
}

/**
 * Hook to persist the user's last selected model ID to localStorage.
 * Returns the selected model ID and a setter function.
 */
export function usePersistedModel(): UsePersistedModelReturn {
  // Read from localStorage synchronously in useState initializer.
  // This prevents the "flash of default model" when the chat tab
  // unmounts and remounts (e.g. switching between tabs), because
  // the correct model is available on the very first render.
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(
    () => {
      if (typeof window === "undefined") {
        console.log("window undef");
        return null;
      }
      try {
        const value = localStorage.getItem(STORAGE_KEY);
        console.log("[usePersistedModel] Initial selectedModelId from localStorage:", value);
        return value;
      } catch (e) {
        console.error("[usePersistedModel] Error reading from localStorage:", e);
        return null;
      }
    },
  );
  const [selectedModelIds, setSelectedModelIdsState] = useState<string[]>(
    () => {
      if (typeof window === "undefined") {
        console.log("window undef !");
        return [];
      }
      try {
        const stored = localStorage.getItem(MULTI_MODEL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            return normalizeSelectedModelIds(parsed as string[]);
          }
        }
      } catch {
        // ignore
      }
      return [];
    },
  );
  const [multiModelEnabled, setMultiModelEnabledState] = useState(() => {
    if (typeof window === "undefined") {
      console.log("window undef 2");
      return false;
    }
    try {
      return localStorage.getItem(MULTI_MODEL_ENABLED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Save the selected model to localStorage whenever it changes
  useEffect(() => {
    console.log("[usePersistedModel] value =");
    console.log("[usePersistedModel] value =", selectedModelId);
    if (typeof window !== "undefined") {
      try {
        const leadModelId = selectedModelIds[0] ?? selectedModelId;

        console.log("[usePersistedModel] Saving to localStorage:", {
          leadModelId,
          selectedModelId,
          selectedModelIds,
          multiModelEnabled,
        });

        if (leadModelId) {
          localStorage.setItem(STORAGE_KEY, leadModelId);
          console.log("[usePersistedModel] Wrote STORAGE_KEY =", STORAGE_KEY, "value =", leadModelId);
        } else {
          localStorage.removeItem(STORAGE_KEY);
          console.log("[usePersistedModel] Removed STORAGE_KEY =", STORAGE_KEY);
        }

        if (selectedModelIds.length > 0) {
          localStorage.setItem(
            MULTI_MODEL_STORAGE_KEY,
            JSON.stringify(selectedModelIds),
          );
        } else {
          localStorage.removeItem(MULTI_MODEL_STORAGE_KEY);
        }

        localStorage.setItem(
          MULTI_MODEL_ENABLED_STORAGE_KEY,
          multiModelEnabled ? "true" : "false",
        );
      } catch (error) {
        console.warn("Failed to save selected model to localStorage:", error);
      }
    }
  }, [multiModelEnabled, selectedModelId, selectedModelIds]);

  const setSelectedModelId = useCallback((modelId: string | null) => {
    console.log("[usePersistedModel] setSelectedModelId called with:", modelId, "stack:", new Error().stack);
    setSelectedModelIdState(modelId);
    setSelectedModelIdsState((previous) => {
      if (!modelId) {
        return [];
      }

      const next = normalizeSelectedModelIds([
        modelId,
        ...previous.filter((existingId) => existingId !== modelId),
      ]);
      return next;
    });
  }, []);

  const setSelectedModelIds = useCallback((modelIds: string[]) => {
    const normalized = normalizeSelectedModelIds(modelIds);
    console.log("[usePersistedModel] setSelectedModelIds called with:", modelIds, "normalized to:", normalized, "stack:", new Error().stack);
    setSelectedModelIdsState(normalized);
    setSelectedModelIdState(normalized[0] ?? null);
  }, []);

  const setMultiModelEnabled = useCallback((enabled: boolean) => {
    setMultiModelEnabledState(enabled);
  }, []);

  return {
    selectedModelId,
    setSelectedModelId,
    selectedModelIds,
    setSelectedModelIds,
    multiModelEnabled,
    setMultiModelEnabled,
  };
}
