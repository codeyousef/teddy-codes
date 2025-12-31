import {
  CheckIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import type { MessageModes } from "core";
import { isRecommendedAgentModel } from "core/llm/toolSupport";
import { useCallback, useEffect, useMemo } from "react";
import { useAuth } from "../../context/Auth";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { selectSelectedChatModel } from "../../redux/slices/configSlice";
import { setMode } from "../../redux/slices/sessionSlice";
import { getFontSize, getMetaKeyLabel } from "../../util";
import { ToolTip } from "../gui/Tooltip";
import { useMainEditor } from "../mainInput/TipTapEditor";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "../ui";
import { ModeIcon } from "./ModeIcon";

export function ModeSelect() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((store) => store.session.mode);
  const selectedModel = useAppSelector(selectSelectedChatModel);
  const { selectedProfile } = useAuth();

  const isGoodAtAgentMode = useMemo(() => {
    if (!selectedModel) {
      return undefined;
    }
    return isRecommendedAgentModel(selectedModel.model);
  }, [selectedModel]);

  const isLocalAgent = useMemo(() => {
    return selectedProfile?.profileType === "local";
  }, [selectedProfile]);

  const { mainEditor } = useMainEditor();
  const metaKeyLabel = useMemo(() => {
    return getMetaKeyLabel();
  }, []);

  const config = useAppSelector((store) => store.config.config);
  const customModes = config.modes || [];

  const cycleMode = useCallback(() => {
    const allModes = [
      "chat",
      "plan",
      "agent",
      "assistant",
      "autonomous",
      "tdd",
      "background",
      ...customModes.map((m) => m.slug),
    ];
    const currentIndex = allModes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % allModes.length;
    let nextMode = allModes[nextIndex];

    if (nextMode === "background" && isLocalAgent) {
      // Skip background if local agent
      const nextNextIndex = (nextIndex + 1) % allModes.length;
      nextMode = allModes[nextNextIndex];
    }

    dispatch(setMode(nextMode));

    // Only focus main editor if another one doesn't already have focus
    if (!document.activeElement?.classList?.contains("ProseMirror")) {
      mainEditor?.commands.focus();
    }
  }, [mode, mainEditor, isLocalAgent, customModes]);

  const selectMode = useCallback(
    (newMode: MessageModes) => {
      if (newMode === mode) {
        return;
      }

      dispatch(setMode(newMode));

      mainEditor?.commands.focus();
    },
    [mode, mainEditor],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "." && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void cycleMode();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cycleMode]);

  // Auto-switch from background mode when local agent is selected
  useEffect(() => {
    if (mode === "background" && isLocalAgent) {
      dispatch(setMode("agent"));
    }
  }, [mode, isLocalAgent, dispatch]);

  const notGreatAtAgent = (mode: string) => (
    <>
      <ToolTip
        style={{
          zIndex: 200001, // in front of listbox
        }}
        className="flex items-center gap-1"
        content={`${mode} might not work well with this model.`}
      >
        <ExclamationTriangleIcon className="text-warning h-2.5 w-2.5" />
      </ToolTip>
    </>
  );

  return (
    <Listbox value={mode} onChange={selectMode}>
      <div className="relative">
        <ListboxButton
          data-testid="mode-select-button"
          className="xs:px-2 text-description bg-lightgray/20 gap-1 rounded-full border-none px-1.5 py-0.5 transition-colors duration-200 hover:brightness-110"
        >
          <ModeIcon mode={mode} />
          <span className="hidden sm:block">
            {mode === "chat"
              ? "Chat"
              : mode === "agent"
                ? "Agent"
                : mode === "background"
                  ? "Background"
                  : mode === "assistant"
                    ? "Assistant"
                    : mode === "autonomous"
                      ? "Autonomous"
                      : mode === "tdd"
                        ? "TDD"
                        : mode === "plan"
                          ? "Plan"
                          : customModes.find((m) => m.slug === mode)?.name ||
                            mode}
          </span>
          <ChevronDownIcon
            className="h-2 w-2 flex-shrink-0"
            aria-hidden="true"
          />
        </ListboxButton>
        <ListboxOptions className="min-w-32 max-w-48">
          <ListboxOption value="chat">
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="chat" />
              <span className="">Chat</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="All tools disabled"
              >
                <InformationCircleIcon
                  data-tooltip-id="chat-tip"
                  className="h-2.5 w-2.5 flex-shrink-0"
                />
              </ToolTip>
              <span
                className={`text-description-muted text-[${getFontSize() - 3}px] mr-auto`}
              >
                {getMetaKeyLabel()}L
              </span>
            </div>
            {mode === "chat" && <CheckIcon className="ml-auto h-3 w-3" />}
          </ListboxOption>
          <ListboxOption value="plan" className={"gap-1"}>
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="plan" />
              <span className="">Plan</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="Read-only/MCP tools available"
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {!isGoodAtAgentMode && notGreatAtAgent("Plan")}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "plan" ? "" : "opacity-0"}`}
            />
          </ListboxOption>

          <ListboxOption value="agent" className={"gap-1"}>
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="agent" />
              <span className="">Agent</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="All tools available"
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {!isGoodAtAgentMode && notGreatAtAgent("Agent")}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "agent" ? "" : "opacity-0"}`}
            />
          </ListboxOption>

          <ListboxOption value="assistant" className={"gap-1"}>
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="assistant" />
              <span className="">Assistant</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="Human-in-the-loop assistance"
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {!isGoodAtAgentMode && notGreatAtAgent("Assistant")}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "assistant" ? "" : "opacity-0"}`}
            />
          </ListboxOption>

          <ListboxOption value="autonomous" className={"gap-1"}>
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="autonomous" />
              <span className="">Autonomous</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="Fully autonomous execution"
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {!isGoodAtAgentMode && notGreatAtAgent("Autonomous")}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "autonomous" ? "" : "opacity-0"}`}
            />
          </ListboxOption>

          <ListboxOption value="tdd" className={"gap-1"}>
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="tdd" />
              <span className="">TDD</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content="Test-Driven Development"
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {!isGoodAtAgentMode && notGreatAtAgent("TDD")}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "tdd" ? "" : "opacity-0"}`}
            />
          </ListboxOption>

          <ListboxOption
            value="background"
            className={"gap-1"}
            disabled={isLocalAgent}
          >
            <div className="flex flex-row items-center gap-1.5">
              <ModeIcon mode="background" />
              <span className="">Background</span>
              <ToolTip
                style={{
                  zIndex: 200001,
                }}
                content={"Background mode cannot be used with local agents."}
              >
                <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
              </ToolTip>
            </div>
            {isLocalAgent && (
              <ExclamationTriangleIcon className="text-warning h-2.5 w-2.5" />
            )}
            <CheckIcon
              className={`ml-auto h-3 w-3 ${mode === "background" ? "" : "opacity-0"}`}
            />
          </ListboxOption>

          {customModes.map((customMode) => (
            <ListboxOption
              key={customMode.slug}
              value={customMode.slug}
              className={"gap-1"}
            >
              <div className="flex flex-row items-center gap-1.5">
                <ModeIcon mode={customMode.slug} />
                <span className="">{customMode.name}</span>
                {customMode.description && (
                  <ToolTip
                    style={{
                      zIndex: 200001,
                    }}
                    content={customMode.description}
                  >
                    <InformationCircleIcon className="h-2.5 w-2.5 flex-shrink-0" />
                  </ToolTip>
                )}
              </div>
              <CheckIcon
                className={`ml-auto h-3 w-3 ${mode === customMode.slug ? "" : "opacity-0"}`}
              />
            </ListboxOption>
          ))}

          <div className="text-description-muted px-2 py-1">
            {`${metaKeyLabel} . for next mode`}
          </div>
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
