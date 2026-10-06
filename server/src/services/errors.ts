/** An expected business-rule failure that should be shown to the user, not logged as a crash. */
export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
