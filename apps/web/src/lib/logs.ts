import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FitnessLogEntry,
  FitnessLogInput,
  FitnessLogUpdate,
  LogList,
  NutritionLogEntry,
  NutritionLogInput,
  NutritionLogUpdate,
  SleepLogEntry,
  SleepLogInput,
  SleepLogUpdate,
} from "@central-command/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api";

// ─── Fitness ─────────────────────────────────────────────────────────────────
export function useFitness() {
  return useQuery({
    queryKey: ["fitness"],
    queryFn: () => apiGet<LogList<FitnessLogEntry>>("/api/fitness"),
  });
}
export function useLogFitness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FitnessLogInput) => apiPost<FitnessLogEntry>("/api/fitness/log", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fitness"] }),
  });
}
export function useUpdateFitness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: FitnessLogUpdate & { id: string }) =>
      apiPatch<FitnessLogEntry>(`/api/fitness/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fitness"] }),
  });
}
export function useDeleteFitness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/api/fitness/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fitness"] }),
  });
}

// ─── Nutrition ───────────────────────────────────────────────────────────────
export function useNutrition() {
  return useQuery({
    queryKey: ["nutrition"],
    queryFn: () => apiGet<LogList<NutritionLogEntry>>("/api/nutrition"),
  });
}
export function useLogNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NutritionLogInput) => apiPost<NutritionLogEntry>("/api/nutrition/log", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nutrition"] }),
  });
}
export function useUpdateNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: NutritionLogUpdate & { id: string }) =>
      apiPatch<NutritionLogEntry>(`/api/nutrition/${id}`, patch),
    // Nutrition feeds the performance score, so refresh that card too.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nutrition"] });
      qc.invalidateQueries({ queryKey: ["performance"] });
    },
  });
}
export function useDeleteNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/api/nutrition/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nutrition"] });
      qc.invalidateQueries({ queryKey: ["performance"] });
    },
  });
}

// ─── Sleep ───────────────────────────────────────────────────────────────────
export function useSleep() {
  return useQuery({
    queryKey: ["sleep"],
    queryFn: () => apiGet<LogList<SleepLogEntry>>("/api/sleep"),
  });
}
export function useLogSleep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SleepLogInput) => apiPost<SleepLogEntry>("/api/sleep/log", input),
    // Sleep feeds the performance score + HRV baseline, so refresh that card too.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep"] });
      qc.invalidateQueries({ queryKey: ["performance"] });
    },
  });
}
export function useUpdateSleep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: SleepLogUpdate & { id: string }) =>
      apiPatch<SleepLogEntry>(`/api/sleep/${id}`, patch),
    // Sleep feeds the performance score, so refresh that card too.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep"] });
      qc.invalidateQueries({ queryKey: ["performance"] });
    },
  });
}
export function useDeleteSleep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/api/sleep/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep"] });
      qc.invalidateQueries({ queryKey: ["performance"] });
    },
  });
}
