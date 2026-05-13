import { Schema } from "@effect/schema";

export const HealthCheckRequest = Schema.Struct({});
export type HealthCheckRequest = typeof HealthCheckRequest.Type;

export const HealthCheckResponse = Schema.Struct({
  status: Schema.String,
});
export type HealthCheckResponse = typeof HealthCheckResponse.Type;

export interface HealthService {
  readonly check: (req: HealthCheckRequest) => Promise<HealthCheckResponse>;
}

export const HealthService = Schema.Tag<HealthService>("HealthService");
