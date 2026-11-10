// No tenant/user mapping or shared accounting bridge has been verified yet.
// Configuration of an AI URL/key alone must never enable a free paid path.
export function aiAccountingAvailable(): boolean {
  return false;
}

export function requireAIAccounting(): void {
  if (!aiAccountingAvailable()) {
    throw new Error("ИИ временно недоступен: общий учёт расхода не подключён");
  }
}
