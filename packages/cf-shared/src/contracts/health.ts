import {
  Array,
  Boolean,
  Literal,
  Number,
  String,
  Struct,
  optional,
} from "effect/Schema";

export const HealthCheckRequest = Struct({});
export type HealthCheckRequest = typeof HealthCheckRequest.Type;

export const HealthCheckResponse = Struct({
  status: String,
});
export type HealthCheckResponse = typeof HealthCheckResponse.Type;

export interface HealthService {
  readonly check: (req: HealthCheckRequest) => Promise<HealthCheckResponse>;
}
