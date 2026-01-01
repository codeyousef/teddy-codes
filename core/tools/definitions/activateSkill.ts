import { Tool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export const activateSkillTool: Tool = {
  type: "function",
  displayTitle: "Activate Skill",
  wouldLikeTo: "activate skill {{{ skill_id }}}",
  isCurrently: "activating skill {{{ skill_id }}}",
  hasAlready: "activated skill {{{ skill_id }}}",
  readonly: true,
  isInstant: true,
  group: BUILT_IN_GROUP_NAME,
  function: {
    name: BuiltInToolNames.ActivateSkill,
    description: "Activate a skill by its ID to retrieve its instructions.",
    parameters: {
      type: "object",
      required: ["skill_id"],
      properties: {
        skill_id: {
          type: "string",
          description: "The ID of the skill to activate.",
        },
      },
    },
  },
};
