"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { IslandTask } from "@/components/kokonutui/status-island";

/**
 * Background work shown in the header's status island (sync, scoring, payout).
 * `track(label, promise)` adds a running task, then marks it done or failed
 * when the promise settles, and returns the promise's own result.
 */
interface TasksValue {
  tasks: IslandTask[];
  track: <T>(label: string, work: Promise<T>, detail?: string) => Promise<T>;
  dismiss: (id: string) => void;
}

const TasksContext = createContext<TasksValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<IslandTask[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const track = useCallback(<T,>(label: string, work: Promise<T>, detail?: string) => {
    const id = `task_${++seq.current}`;
    setTasks((prev) => [...prev, { id, label, detail, status: "running" }]);
    const settle = (patch: Partial<IslandTask>) =>
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
    return work.then(
      (result) => {
        settle({ status: "done" });
        return result;
      },
      (error: unknown) => {
        settle({ status: "error", detail: error instanceof Error ? error.message : "Failed" });
        throw error;
      }
    );
  }, []);

  const value = useMemo(() => ({ tasks, track, dismiss }), [tasks, track, dismiss]);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

/** Outside the app shell (e.g. tests) tracking is a pass-through. */
export function useTasks(): TasksValue {
  return (
    useContext(TasksContext) ?? {
      tasks: [],
      track: (_label, work) => work,
      dismiss: () => {},
    }
  );
}
