import type { Edge, Node } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";

type HistoryState = {
  nodes: Node[];
  edges: Edge[];
};

const MAX_HISTORY = 50;

// Helper to compare if two states are equal
function areStatesEqual(state1: HistoryState, state2: HistoryState): boolean {
  if (
    state1.nodes.length !== state2.nodes.length ||
    state1.edges.length !== state2.edges.length
  ) {
    return false;
  }

  // Compare nodes by ID and position
  for (let i = 0; i < state1.nodes.length; i++) {
    const n1 = state1.nodes[i];
    const n2 = state2.nodes[i];
    if (
      n1.id !== n2.id ||
      n1.position.x !== n2.position.x ||
      n1.position.y !== n2.position.y ||
      JSON.stringify(n1.data) !== JSON.stringify(n2.data)
    ) {
      return false;
    }
  }

  // Compare edges by ID and connections
  for (let i = 0; i < state1.edges.length; i++) {
    const e1 = state1.edges[i];
    const e2 = state2.edges[i];
    if (e1.id !== e2.id || e1.source !== e2.source || e1.target !== e2.target) {
      return false;
    }
  }

  return true;
}

export function useUndoRedo(initialNodes: Node[], initialEdges: Edge[]) {
  const [history, setHistory] = useState<HistoryState[]>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoOperationRef = useRef(false);

  const canUndo = useMemo(() => historyIndex > 0, [historyIndex]);
  const canRedo = useMemo(
    () => historyIndex < history.length - 1,
    [historyIndex, history.length],
  );

  const addToHistory = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      // Don't add to history if we're in the middle of an undo/redo operation
      if (isUndoRedoOperationRef.current) {
        return;
      }

      setHistory((prev) => {
        // Get current state at historyIndex
        const currentState = prev[historyIndex];
        const newState = { nodes, edges };

        // Don't add if the state hasn't actually changed
        if (currentState && areStatesEqual(currentState, newState)) {
          return prev;
        }

        // Remove any history after current index (when undoing and then making a new change)
        const newHistory = prev.slice(0, historyIndex + 1);

        // Add new state
        const updatedHistory = [...newHistory, newState];

        // Limit history size
        if (updatedHistory.length > MAX_HISTORY) {
          return updatedHistory.slice(-MAX_HISTORY);
        }

        return updatedHistory;
      });

      setHistoryIndex((prev) => {
        const newIndex = prev + 1;
        // Adjust if we hit the max history limit
        return newIndex >= MAX_HISTORY ? MAX_HISTORY - 1 : newIndex;
      });
    },
    [historyIndex],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) {
      return null;
    }

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    return history[newIndex];
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) {
      return null;
    }

    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    return history[newIndex];
  }, [history, historyIndex]);

  const reset = useCallback((nodes: Node[], edges: Edge[]) => {
    setHistory([{ nodes, edges }]);
    setHistoryIndex(0);
  }, []);

  return {
    addToHistory,
    canRedo,
    canUndo,
    redo,
    reset,
    undo,
  };
}
