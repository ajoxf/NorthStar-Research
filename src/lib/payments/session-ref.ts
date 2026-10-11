/** The provider's own session id, as stored on an order: "{provider}:{session}". */
export function sessionIdOf(gatewayId: string, stored: string): string {
  return stored.startsWith(`${gatewayId}:`) ? stored.slice(gatewayId.length + 1) : stored
}
