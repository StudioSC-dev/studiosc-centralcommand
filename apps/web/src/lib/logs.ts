import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FitnessLogEntry,
  FitnessLogInput,
  LogList,
  NutritionLogEntry,
  NutritionLogInput,
  SleepLogEntry,
  SleepLogInput,
} from "@central-command/types";
import { apiGet, apiPost } from "./api";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sleep"] }),
  });
}
