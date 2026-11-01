import type { WireStats } from "./stats";

export type TcpProof = {
  match: boolean;
  differentPorts: boolean;
  controlPort: number;
  dataPort: number;
  wire: WireStats;
  cipher: WireStats;
  sample: string[];
};
