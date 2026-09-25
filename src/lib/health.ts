export type ReadinessInput = {
  supabaseConfigured: boolean;
  databaseConfigured: boolean;
  databaseReachable: boolean;
  databaseSchemaReady: boolean;
  serviceRoleConfigured: boolean;
};

export function isReady(input: ReadinessInput): boolean {
  return (
    input.supabaseConfigured &&
    input.databaseConfigured &&
    input.databaseReachable &&
    input.databaseSchemaReady &&
    input.serviceRoleConfigured
  );
}
