import { definePlugin } from "nitro";
import { handleWorkflowQueueMessage } from "./workflowQueue";

export default definePlugin((nitro) => {
  nitro.hooks.hook("vercel:queue", handleWorkflowQueueMessage);
});
