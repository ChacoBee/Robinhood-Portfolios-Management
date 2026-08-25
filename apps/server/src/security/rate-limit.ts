export const rateLimitPolicy = {
  reads: { max: 120, timeWindow: '1 minute' },
  refresh: { max: 6, timeWindow: '1 minute' },
  imports: { max: 3, timeWindow: '10 minutes' },
  recovery: { max: 5, timeWindow: '1 hour' },
  sensitive: { max: 3, timeWindow: '10 minutes' },
} as const;
