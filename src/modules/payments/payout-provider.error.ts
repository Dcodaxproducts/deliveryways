export class PayoutProviderError extends Error {
  constructor(
    message: string,
    readonly definitive: boolean,
  ) {
    super(message);
    this.name = PayoutProviderError.name;
  }
}
