import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as Blockly from "blockly/core";
import {
  registerContinuousToolbox,
  ContinuousMetrics,
  ContinuousFlyout,
  ContinuousToolbox,
} from "@blockly/continuous-toolbox";
import { X } from "lucide-react";
import { EXAMPLES, type BlockSpec } from "../blocks";
import {
  buildToolbox,
  configureBlockLanguage,
  configureBlockArchitecture,
  migrateWorkspace,
  readExpression,
  readWorkspace,
  saveWorkspaceData,
  specState,
  theme,
} from "../block-model";
import type { CompileResult } from "../engine/compiler";
import type { CpuState } from "../engine/cpu";
import { evaluateExpression } from "../engine/evaluate";
import { localizeMessage, t, type Language } from "../i18n";
import { signed } from "../registers";
import {
  displayWord,
  getArchitecture,
  isTargetImmediate,
  isTargetRegister,
  canWriteRegister,
  type Architecture,
} from "../architectures";
import { exampleBlocks } from "../examples";
import { evaluateTarget } from "../engine/machine";

registerContinuousToolbox();
class ScratchFlyout extends ContinuousFlyout {
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(options: Blockly.Options) {
    super(options);
    this.setRecyclingEnabled(false);
  }
  override show(contents: Blockly.utils.toolbox.FlyoutDefinition | string) {
    clearTimeout(this.refreshTimer);
    if (this.disposed) return;
    // The plugin refreshes after edits. Never dispose a template while a pointer
    // gesture is using it: its field values would be lost before the drag starts.
    if (
      this.targetWorkspace?.getGesture() ||
      this.getWorkspace()?.getGesture()
    ) {
      this.refreshTimer = setTimeout(() => this.show(contents), 50);
      return;
    }
    super.show(contents);
    for (const block of this.getWorkspace().getBlocksByType("asm_start", false))
      block.setDisabledReason(
        this.targetWorkspace.getBlocksByType("asm_start", false).length > 0,
        "singleton",
      );
  }
  override getClientRect(): Blockly.utils.Rect | null {
    if (!this.getWorkspace().getParentSvg().getBoundingClientRect().width)
      return null;
    return super.getClientRect();
  }
  override dispose() {
    this.disposed = true;
    clearTimeout(this.refreshTimer);
    super.dispose();
  }
}
class ScratchToolbox extends ContinuousToolbox {
  override getClientRect(): Blockly.utils.Rect | null {
    const category = this.HtmlDiv?.getBoundingClientRect();
    if (!category?.width || !category.height) return null;
    const palette = this.getFlyout()
      ?.getWorkspace()
      .getParentSvg()
      .getBoundingClientRect();
    // A collapsed mobile flyout has no rectangle. The category rail is still a delete target.
    return new Blockly.utils.Rect(
      category.top,
      Math.max(
        category.bottom,
        palette?.height ? palette.bottom : category.bottom,
      ),
      category.left,
      Math.max(category.right, palette?.width ? palette.right : category.right),
    );
  }
}
const compact = () => window.matchMedia("(max-width: 600px)").matches;
class ScratchMetrics extends ContinuousMetrics {
  override getFlyoutMetrics(own?: boolean) {
    const metrics = super.getFlyoutMetrics(own);
    if (compact()) metrics.width = 0;
    return metrics;
  }
}
export type WorkspaceData = ReturnType<
  typeof Blockly.serialization.workspaces.save
>;
export type EditorHandle = {
  loadExample: (blocks: BlockSpec[]) => void;
  load: (data: WorkspaceData) => void;
  save: () => WorkspaceData;
  zoom: (amount: number) => void;
  fit: () => void;
  undo: (redo?: boolean) => void;
  focusBlock: (id: string) => void;
  togglePalette: () => void;
};
type Props = {
  initialData: WorkspaceData | null;
  activeId: string | null;
  breakpoints: string[];
  language: Language;
  architecture: Architecture;
  state: CpuState;
  visible: boolean;
  onChange: (result: CompileResult, workspace: WorkspaceData) => void;
  onToggleBreakpoint: (id: string) => void;
};
function loadWorkspace(data: WorkspaceData, workspace: Blockly.WorkspaceSvg) {
  Blockly.serialization.workspaces.load(
    validateWorkspaceData(data, getArchitecture()),
    workspace,
  );
}
export function validateWorkspaceData(
  data: WorkspaceData,
  architecture: Architecture,
) {
  const previous = getArchitecture(),
    workspace = new Blockly.Workspace();
  try {
    configureBlockArchitecture(architecture);
    const prepared = migrateWorkspace(data);
    const inspect = (state: Blockly.serialization.blocks.State) => {
      if (state.type === "value_number") {
        const value = state.fields?.NUM ?? "";
        if (
          (typeof value === "number" && !Number.isSafeInteger(value)) ||
          (String(value).trim() &&
            !isTargetImmediate(String(value), architecture))
        )
          throw new Error("Invalid integer for this architecture.");
      }
      const field =
        state.type === "value_register"
          ? "REG"
          : state.type.startsWith("asm_") &&
              !["asm_start", "asm_label", "asm_branch", "asm_call"].includes(
                state.type,
              ) &&
              !state.type.startsWith("asm_j")
            ? "A"
            : null;
      if (field && state.fields?.[field] !== undefined) {
        const value = String(state.fields[field]).toUpperCase();
        if (
          !isTargetRegister(value, architecture) ||
          (field === "A" && !canWriteRegister(value, architecture))
        )
          throw new Error("Invalid register for this architecture.");
        state.fields[field] = value;
      }
      for (const input of Object.values(state.inputs || {})) {
        if (input.block) inspect(input.block);
        if (input.shadow) inspect(input.shadow);
      }
      if (state.next?.block) inspect(state.next.block);
    };
    const roots = (
      prepared.blocks as
        { blocks?: Blockly.serialization.blocks.State[] } | undefined
    )?.blocks;
    if (roots) roots.forEach(inspect);
    Blockly.serialization.workspaces.load(prepared, workspace);
    return prepared;
  } finally {
    workspace.dispose();
    configureBlockArchitecture(previous);
  }
}
function fillWorkspace(workspace: Blockly.WorkspaceSvg, specs: BlockSpec[]) {
  const statements = exampleBlocks(specs, getArchitecture()).map(specState);
  for (let index = statements.length - 2; index >= 0; index--)
    statements[index].next = { block: statements[index + 1] };
  loadWorkspace(
    statements.length
      ? {
          blocks: {
            languageVersion: 0,
            blocks: [
              {
                type: "asm_start",
                x: compact() ? 50 : 110,
                y: 72,
                next: { block: statements[0] },
              },
            ],
          },
        }
      : {},
    workspace,
  );
  workspace.setScale(0.95);
  workspace.scroll(0, 0);
  if (compact()) {
    workspace.render();
    let y = 64;
    for (const block of workspace
      .getTopBlocks(true)
      .filter((block) => !block.outputConnection)) {
      const position = block.getRelativeToSurfaceXY();
      block.moveBy(50 - position.x, y - position.y);
      y += block.getHeightWidth().height + 55;
    }
  }
  const metrics = workspace.getMetrics();
  const bounds = workspace.getBlocksBoundingBox();
  // Wider register panes must not hide the right-hand event stack of an example.
  if (
    bounds.right * workspace.scale > (metrics?.viewWidth || 300) - 24 ||
    bounds.bottom * workspace.scale > (metrics?.viewHeight || 600) - 30
  ) {
    if (
      !compact() &&
      bounds.getWidth() * workspace.scale <= (metrics?.viewWidth || 300) - 24 &&
      bounds.getHeight() * workspace.scale <= (metrics?.viewHeight || 600) - 30
    ) {
      workspace.scroll(
        Math.min(
          0,
          (metrics?.viewWidth || 300) - 24 - bounds.right * workspace.scale,
        ),
        Math.min(
          0,
          (metrics?.viewHeight || 600) - 30 - bounds.bottom * workspace.scale,
        ),
      );
    } else workspace.zoomToFit();
  }
}
const jumpTypes = [
  "asm_jmp",
  "asm_branch",
  "asm_je",
  "asm_jne",
  "asm_jg",
  "asm_jl",
  "asm_call",
];
type Preview = { id: string; flyout: boolean; x: number; y: number };
export const BlockEditor = forwardRef<EditorHandle, Props>(
  function BlockEditor(props, ref) {
    const host = useRef<HTMLDivElement>(null),
      workspace = useRef<Blockly.WorkspaceSvg | null>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    const initialData = useRef(props.initialData),
      language = useRef(props.language);
    const [preview, setPreview] = useState<Preview | null>(null);
    useImperativeHandle(
      ref,
      () => ({
        loadExample(blocks) {
          if (workspace.current) {
            setPreview(null);
            fillWorkspace(workspace.current, blocks);
            workspace.current.clearUndo();
          }
        },
        load(data) {
          if (workspace.current) {
            setPreview(null);
            loadWorkspace(data, workspace.current);
            workspace.current.scroll(0, 0);
          }
        },
        save() {
          return workspace.current ? saveWorkspaceData(workspace.current) : {};
        },
        zoom(amount) {
          const ws = workspace.current;
          if (ws) {
            const metrics = ws.getMetrics();
            ws.zoom(
              (metrics?.viewWidth || 600) / 2,
              (metrics?.viewHeight || 400) / 2,
              amount,
            );
            setPreview(null);
          }
        },
        fit() {
          workspace.current?.zoomToFit();
          setPreview(null);
        },
        undo(redo = false) {
          workspace.current?.undo(redo);
        },
        togglePalette() {
          host.current?.classList.toggle("palette-closed");
        },
        focusBlock(id) {
          const ws = workspace.current,
            block = ws?.getBlockById(id);
          if (block && ws) {
            block.select();
            ws.centerOnBlock(id);
          }
        },
      }),
      [],
    );
    useEffect(() => {
      if (!host.current) return;
      configureBlockArchitecture(callbacks.current.architecture);
      configureBlockLanguage(callbacks.current.language);
      host.current.classList.toggle("palette-closed", compact());
      const ws = Blockly.inject(host.current, {
        renderer: "zelos",
        plugins: {
          flyoutsVerticalToolbox: ScratchFlyout,
          metricsManager: ScratchMetrics,
          toolbox: ScratchToolbox,
        },
        theme,
        sounds: false,
        trashcan: false,
        media: `${import.meta.env.BASE_URL}blockly-media/`,
        toolbox: buildToolbox(),
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: {
          controls: false,
          wheel: true,
          startScale: 0.95,
          minScale: 0.4,
          maxScale: 1.6,
          scaleSpeed: 1.12,
        },
        grid: { spacing: 28, length: 1, colour: "var(--grid)", snap: false },
      });
      workspace.current = ws;
      const flyout = ws.getFlyout();
      if (flyout) flyout.autoClose = false;
      ws.getToolbox()?.selectItemByPosition(0);
      const syncStart = () => {
        for (const block of ws
          .getFlyout()
          ?.getWorkspace()
          .getBlocksByType("asm_start", false) || [])
          block.setDisabledReason(
            ws.getBlocksByType("asm_start", false).length > 0,
            "singleton",
          );
      };
      const emit = () => {
        syncStart();
        callbacks.current.onChange(readWorkspace(ws), saveWorkspaceData(ws));
      };
      const showPreview = (
        event: Blockly.Events.Abstract,
        owner: Blockly.Workspace,
      ) => {
        if (event.type === Blockly.Events.VIEWPORT_CHANGE) {
          setPreview(null);
          return;
        }
        if (event.type !== Blockly.Events.CLICK) return;
        const click = event as Blockly.Events.Click;
        const block = click.blockId ? owner.getBlockById(click.blockId) : null;
        if (
          !block?.outputConnection ||
          block.isShadow() ||
          block.type === "value_number"
        ) {
          setPreview(null);
          return;
        }
        const element = (block as Blockly.BlockSvg).getSvgRoot(),
          bounds = element?.getBoundingClientRect(),
          container = host.current?.getBoundingClientRect();
        if (bounds && container)
          setPreview({
            id: block.id,
            flyout: owner !== ws,
            x: Math.max(
              8,
              Math.min(
                bounds.right - container.left + 8,
                container.width - 180,
              ),
            ),
            y: Math.max(
              8,
              Math.min(bounds.top - container.top, container.height - 86),
            ),
          });
      };
      const listener = (event: Blockly.Events.Abstract) => {
        showPreview(event, ws);
        if (event.type === Blockly.Events.BLOCK_DRAG) {
          setPreview(null);
          if (compact() && (event as Blockly.Events.BlockDrag).isStart) {
            host.current?.classList.add("palette-closed");
            // The now-hidden flyout must stop covering the workspace as a delete area.
            ws.recordDragTargets();
          }
        }
        if (event.type === Blockly.Events.BLOCK_CREATE && event.recordUndo) {
          const created = (event as Blockly.Events.BlockCreate).ids || [],
            group = Blockly.Events.getGroup();
          Blockly.Events.setGroup(event.group || true);
          for (const id of created) {
            const label = ws.getBlockById(id);
            if (label?.type !== "asm_label") continue;
            const oldName = label.getFieldValue("A"),
              others = ws
                .getBlocksByType("asm_label", false)
                .filter((item) => item.id !== id);
            if (!others.some((item) => item.getFieldValue("A") === oldName))
              continue;
            const names = new Set(
              others.map((item) => item.getFieldValue("A")),
            );
            const prefix = t("Marke", "Label");
            let index = 1;
            while (names.has(`${prefix}${index}`)) index++;
            const name = `${prefix}${index}`;
            label.setFieldValue(name, "A");
            for (const childId of created) {
              const child = ws.getBlockById(childId);
              if (
                child &&
                jumpTypes.includes(child.type) &&
                child.getFieldValue("A") === oldName
              )
                child.setFieldValue(name, "A");
            }
          }
          Blockly.Events.setGroup(group);
        }
        if (event.type === Blockly.Events.BLOCK_CHANGE) {
          const change = event as Blockly.Events.BlockChange;
          if (
            change.element === "field" &&
            change.name === "A" &&
            ws.getBlockById(change.blockId || "")?.type === "asm_label" &&
            !ws
              .getBlocksByType("asm_label", false)
              .some(
                (label) =>
                  label.id !== change.blockId &&
                  label.getFieldValue("A") === change.oldValue,
              )
          ) {
            const group = Blockly.Events.getGroup();
            Blockly.Events.setGroup(event.group || true);
            for (const block of ws.getAllBlocks(false))
              if (
                jumpTypes.includes(block.type) &&
                block.getFieldValue("A") === change.oldValue
              )
                block.setFieldValue(change.newValue, "A");
            Blockly.Events.setGroup(group);
          }
        }
        if (!event.isUiEvent && event.type !== Blockly.Events.FINISHED_LOADING)
          emit();
      };
      ws.addChangeListener(listener);
      const paletteWorkspace = ws.getFlyout()!.getWorkspace();
      const flyoutListener = (event: Blockly.Events.Abstract) =>
        showPreview(event, paletteWorkspace);
      paletteWorkspace.addChangeListener(flyoutListener);
      const contextName = `asm_breakpoint_${ws.id}`;
      Blockly.ContextMenuRegistry.registry.register({
        id: contextName,
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        displayText: (scope) =>
          callbacks.current.breakpoints.includes(scope.block!.id)
            ? t("Breakpoint entfernen", "Remove breakpoint")
            : t("Breakpoint setzen", "Set breakpoint"),
        preconditionFn: (scope) =>
          !scope.block ||
          scope.block.outputConnection ||
          ["asm_label", "asm_start"].includes(scope.block.type)
            ? "disabled"
            : "enabled",
        callback: (scope) => {
          if (scope.block) callbacks.current.onToggleBreakpoint(scope.block.id);
        },
        weight: 1,
      });
      try {
        if (initialData.current) loadWorkspace(initialData.current, ws);
        else fillWorkspace(ws, EXAMPLES[0].blocks);
      } catch {
        fillWorkspace(ws, EXAMPLES[0].blocks);
      }
      emit();
      const resizeObserver = new ResizeObserver(() => Blockly.svgResize(ws));
      resizeObserver.observe(host.current);
      const categoryClick = (event: Event) => {
        if (
          compact() &&
          (event.target as Element).closest(".blocklyToolboxCategoryContainer")
        ) {
          host.current?.classList.remove("palette-closed");
          Blockly.svgResize(ws);
        }
      };
      const resizeMode = () => {
        host.current?.classList.toggle("palette-closed", compact());
        Blockly.svgResize(ws);
        setPreview(null);
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key === "Escape") setPreview(null);
      };
      // Reveal before Blockly measures its scroll target, not after the click.
      host.current.addEventListener("pointerdown", categoryClick, true);
      window.addEventListener("keydown", escape);
      const mediaQuery = window.matchMedia("(max-width: 600px)");
      mediaQuery.addEventListener("change", resizeMode);
      return () => {
        resizeObserver.disconnect();
        host.current?.removeEventListener("pointerdown", categoryClick, true);
        window.removeEventListener("keydown", escape);
        mediaQuery.removeEventListener("change", resizeMode);
        Blockly.ContextMenuRegistry.registry.unregister(contextName);
        ws.removeChangeListener(listener);
        paletteWorkspace.removeChangeListener(flyoutListener);
        ws.dispose();
        workspace.current = null;
      };
    }, []);
    useEffect(() => {
      const ws = workspace.current;
      if (!ws || language.current === props.language) return;
      language.current = props.language;
      setPreview(null);
      const data = saveWorkspaceData(ws),
        scale = ws.scale,
        x = ws.scrollX,
        y = ws.scrollY;
      const undo = ws.getUndoStack().slice(),
        redo = ws.getRedoStack().slice();
      configureBlockLanguage(props.language);
      ws.updateToolbox(buildToolbox());
      loadWorkspace(data, ws);
      ws.setScale(scale);
      ws.scroll(x, y);
      ws.getUndoStack().splice(0, ws.getUndoStack().length, ...undo);
      ws.getRedoStack().splice(0, ws.getRedoStack().length, ...redo);
      for (const block of ws
        .getFlyout()
        ?.getWorkspace()
        .getBlocksByType("asm_start", false) || [])
        block.setDisabledReason(
          ws.getBlocksByType("asm_start", false).length > 0,
          "singleton",
        );
    }, [props.language]);
    useEffect(() => {
      workspace.current?.highlightBlock(props.activeId);
    }, [props.activeId]);
    useEffect(() => {
      if (props.visible && workspace.current) {
        Blockly.svgResize(workspace.current);
        workspace.current.render();
      } else setPreview(null);
    }, [props.visible]);
    let previewText = "",
      previewError = false;
    if (preview) {
      const owner = preview.flyout
        ? workspace.current?.getFlyout()?.getWorkspace()
        : workspace.current;
      const block = owner?.getBlockById(preview.id);
      if (block) {
        try {
          const value =
            props.architecture === "x86"
              ? evaluateExpression(readExpression(block), props.state)
              : evaluateTarget(readExpression(block), props.state);
          previewText = block.outputConnection?.getCheck()?.includes("Boolean")
            ? value
              ? t("wahr", "true")
              : t("falsch", "false")
            : props.architecture === "x86"
              ? String(signed(Number(value)))
              : displayWord(value, props.architecture);
        } catch (error) {
          previewError = true;
          previewText = localizeMessage(
            error instanceof Error
              ? error.message
              : t("Ungültiger Wert.", "Invalid value."),
          );
        }
      }
    }
    return (
      <div className="blockly-host" ref={host}>
        {preview && previewText && (
          <div
            className={`value-preview ${previewError ? "error" : ""}`}
            role="status"
            style={{ left: preview.x, top: preview.y }}
          >
            <span>{t("Aktueller Wert", "Current value")}</span>
            <strong>{previewText}</strong>
            <button
              className="plain-icon"
              onClick={() => setPreview(null)}
              aria-label={t("Vorschau schließen", "Close preview")}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    );
  },
);
