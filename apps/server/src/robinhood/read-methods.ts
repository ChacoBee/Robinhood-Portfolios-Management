export const allowedRobinhoodTools = [
  'mcp__robinhood__get_accounts',
  'mcp__robinhood__get_portfolio',
  'mcp__robinhood__get_equity_positions',
  'mcp__robinhood__get_equity_quotes',
  'mcp__robinhood__get_option_positions',
] as const;

export type AllowedRobinhoodTool = (typeof allowedRobinhoodTools)[number];

export const requiredRobinhoodReadScopes = [
  'accounts:read',
  'positions:read',
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
