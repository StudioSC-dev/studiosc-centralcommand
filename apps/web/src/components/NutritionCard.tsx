import { useState } from "react";
import { Card } from "./Card";
import { useLogNutrition, useNutrition } from "../lib/logs";

export function NutritionCard() {
  const { data, isPending } = useNutrition();
  const log = useLogNutrition();
  const [meal, setMeal] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Number(calories);
    if (!cal) return;
    log.mutate(
      {
        meal: meal.trim() || undefined,
        calories: cal,
        protein: protein ? Number(protein) : undefined,
      },
      {
        onSuccess: () => {
          setMeal("");
          setCalories("");
          setProtein("");
        },
      },
    );
  };

  return (
    <Card title="Nutrition">
      <form className="log-form" onSubmit={submit}>
        <input placeholder="meal" value={meal} onChange={(e) => setMeal(e.target.value)} />
        <input type="number" min="1" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} />
        <input type="number" min="0" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
        <button type="submit" disabled={log.isPending}>Log</button>
      </form>
      {log.isError && <p className="log-error">{log.error.message}</p>}
      {isPending ? (
        <p>Loading…</p>
      ) : (
        <ul className="log-list">
          {(data?.entries ?? []).slice(0, 5).map((e) => (
            <li key={e.id}>
              {e.meal ?? "meal"} · {e.calories} kcal{e.protein != null ? ` · ${e.protein}g protein` : ""}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
