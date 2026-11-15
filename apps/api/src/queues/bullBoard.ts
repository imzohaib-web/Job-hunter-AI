import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getDiscoveryDlq, getDiscoveryQueue } from "./discoveryQueue.js";
import { getResumeQueue } from "./resumeQueue.js";

let serverAdapter: ExpressAdapter | null = null;

export function getBullBoardAdapter(): ExpressAdapter {
  if (!serverAdapter) {
    serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/admin/queues");

    createBullBoard({
      queues: [
        new BullMQAdapter(getResumeQueue()),
        new BullMQAdapter(getDiscoveryQueue()),
        new BullMQAdapter(getDiscoveryDlq()),
      ],
      serverAdapter,
    });
  }

  return serverAdapter;
}
