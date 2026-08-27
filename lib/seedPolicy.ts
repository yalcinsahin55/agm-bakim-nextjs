type SeedPolicyEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  SEED_ENDPOINT_ENABLED?: string;
};

export function isSeedEndpointEnabled(environment: SeedPolicyEnvironment = process.env): boolean {
  const productionLike = environment.VERCEL_ENV === "production"
    || (environment.NODE_ENV === "production" && environment.VERCEL_ENV !== "preview" && environment.VERCEL_ENV !== "development");
  return !productionLike || environment.SEED_ENDPOINT_ENABLED === "true";
}
