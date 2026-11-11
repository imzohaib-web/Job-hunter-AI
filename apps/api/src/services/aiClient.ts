import axios, { type AxiosInstance, isAxiosError } from "axios";
import axiosRetry from "axios-retry";
import { env } from "../config/env.js";

export interface AiClientOptions {
  baseURL?: string;
  serviceKey?: string;
  timeoutMs?: number;
  retries?: number;
}

/** Retry only on network failures and HTTP 5xx (not 4xx). */
export function shouldRetryAiRequest(error: Error): boolean {
  if (!isAxiosError(error)) {
    return false;
  }
  if (!error.response) {
    return true;
  }
  const status = error.response.status;
  return status >= 500 && status < 600;
}

export function createAiClient(options: AiClientOptions = {}): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL ?? env.AI_SERVICE_URL,
    timeout: options.timeoutMs ?? 60_000,
    headers: {
      "X-Service-Key": options.serviceKey ?? env.AI_SERVICE_KEY,
      Accept: "application/json",
    },
  });

  // 3 tries total => 1 initial request + 2 retries
  axiosRetry(client, {
    retries: options.retries ?? 2,
    retryDelay: axiosRetry.exponentialDelay,
    shouldResetTimeout: true,
    retryCondition: (error) => shouldRetryAiRequest(error),
  });

  return client;
}

export const aiClient = createAiClient();
