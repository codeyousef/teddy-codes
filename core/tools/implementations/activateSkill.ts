import { ToolImpl } from ".";
import { SkillService } from "../../skills/SkillService";
import { getStringArg } from "../parseArgs";

export const activateSkillImpl: ToolImpl = async (args, extras) => {
  const skillId = getStringArg(args, "skill_id");
  const content = await SkillService.getInstance().activateSkill(
    skillId,
    extras.ide,
  );

  return [
    {
      name: `Skill: ${skillId}`,
      content,
      description: `Activated skill ${skillId}`,
    },
  ];
};
