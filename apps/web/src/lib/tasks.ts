import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Task,
  TaskCreateInput,
  TasksResponse,
  TaskUpdateInput,
} from "@central-command/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api";

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () => apiGet<TasksResponse>("/api/tasks"),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreateInput) => apiPost<Task>("/api/tasks", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: TaskUpdateInput & { id: string }) =>
      apiPatch<Task>(`/api/tasks/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/api/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
