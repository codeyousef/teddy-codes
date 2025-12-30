import { ConfigYaml } from "@continuedev/config-yaml";

export const defaultConfig: ConfigYaml = {
  name: "Local Config",
  version: "1.0.0",
  schema: "v1",
  models: [],
  modes: [
    {
      name: "Chat",
      slug: "chat",
    },
    {
      name: "Edit",
      slug: "edit",
    },
    {
      name: "Agent",
      slug: "agent",
    },
    {
      name: "Assistant",
      slug: "assistant",
    },
    {
      name: "Autonomous",
      slug: "autonomous",
    },
  ],
};
