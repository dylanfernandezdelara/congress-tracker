import { handleApiFetch, type ApiEnv } from "./http";

export default {
  fetch: handleApiFetch,
} satisfies ExportedHandler<ApiEnv>;
