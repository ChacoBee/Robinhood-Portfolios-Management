export const allowedRobinhoodTools = [
  'get_accounts',
  'get_portfolio',
  'get_equity_positions',
  'get_equity_quotes',
  'get_option_positions',
  'get_option_quotes',
  'get_option_instruments',
] as const;

export type AllowedRobinhoodTool = (typeof allowedRobinhoodTools)[number];

export const requiredRobinhoodReadScopes = [
  'internal',
] as const;

export type RobinhoodReadScope = (typeof requiredRobinhoodReadScopes)[number];

export function parseExactRobinhoodReadScopes(
  raw: string,
): readonly RobinhoodReadScope[] {
  const scopes = raw.split(',').map((scope) => scope.trim());
  const expected = new Set<string>(requiredRobinhoodReadScopes);
  if (
    scopes.some((scope) => scope.length === 0) ||
    new Set(scopes).size !== scopes.length ||
    scopes.length !== expected.size ||
    scopes.some((scope) => !expected.has(scope))
  ) {
    throw new Error('provider_scope_invalid');
  }
  return requiredRobinhoodReadScopes;
}

const allowedToolSet: ReadonlySet<string> = new Set(allowedRobinhoodTools);

export function assertAllowedRobinhoodTool(
  tool: string,
): asserts tool is AllowedRobinhoodTool {
  if (!allowedToolSet.has(tool)) {
    throw new Error(`Robinhood tool rejected by the read-only boundary: ${tool}`);
  }
}
