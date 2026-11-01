import { createServerFn } from "@tanstack/react-start";
import type { TcpProof } from "./tcp-proof";
import type { Profile } from "./wire";

export type { TcpProof };

export type ProveInput = { profile: Profile; payload: string };

export const proveSockets = createServerFn({ method: "POST" })
  .validator((data: ProveInput): ProveInput => {
    if (data.profile !== "talk" && data.profile !== "dense") throw new Error("档位不对");
    if (typeof data.payload !== "string" || data.payload.length < 1 || data.payload.length > 2000) {
      throw new Error("内容太短或太长");
    }
    return { profile: data.profile, payload: data.payload };
  })
  .handler(async ({ data }): Promise<TcpProof> => {
    const { proveTcp } = await import("./node-host.server");
    return proveTcp(data.profile, data.payload);
  });
