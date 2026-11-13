# scratchsembly — interface design

## Principle

Keep the editor genuinely Scratch-like without unrelated Scratch decoration. Every visible element should help users connect instructions, run a program, or understand CPU state. Avoid dashboard clutter, decorative stage areas, and marketing copy inside the editor.

## Workspace and runtime

| Area                           | Decision                                                         | Reason                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name                   | **scratchsembly** throughout the interface and project downloads | Existing storage keys and project files remain compatible.                                                                                                                 |
| Stage, sprites, speech bubbles | Not included                                                     | Programs produce register, memory, and stack state, not graphics or sprite behavior.                                                                                       |
| Main views                     | Separate, full-size **Blocks** and **Assembly** tabs             | Source should not compete with the editor in a small bottom drawer. Switching views preserves editor and CPU state.                                                        |
| Register display               | Every general-purpose register for the selected architecture     | Scratch-style monitors with letter aliases, native names, and orange value capsules; no visibility checkboxes. Changed values receive a yellow border.                     |
| Larger register sets           | Two compact columns, no separate register scroll area            | All values stay visible, including all 32 AArch64 registers. Density and panel width adapt to the viewport. Full-width numbers must remain readable rather than truncated. |
| Stack                          | A complete, independently scrollable list beneath the registers  | Every active value from H is accessible, newest first, with addresses and SP visible. No fixed-size preview.                                                               |
| Number format                  | One decimal/hex selector for registers and stack                 | Signed decimal is the default at the project's word width. No per-register configuration.                                                                                  |
| Execution controls             | Start, stop/reset, pause/resume, step                            | Start begins again; resume preserves state. One step is one visible statement, not an individual compiler temporary instruction.                                           |
| Errors                         | At the affected block or in the runtime view                     | No automatic switch to a technical subview. Preview errors do not modify registers or counters.                                                                            |
| Projects                       | Local autosave, import/export under File                         | No accounts or cloud claims. One current project, with downloads for separate copies.                                                                                      |

## Blocks and values

- **Values are not statements.** Register reporters are round and can be nested or parked freely. Numeric expressions are round; Boolean comparisons are hexagonal. Their shape communicates their type, and nesting communicates parentheses.
- **Readable aliases.** A–H retain their original roles; larger register sets extend through P or AF. H is always SP, G is the frame/base pointer. Native names and roles stay available beside values and in tooltips.
- **Click to inspect.** A reporter click opens a read-only live value preview, not a register picker. It never executes instructions, writes memory, or uses a temporary stack frame.
- **Right-click for an explanation.** Every block's context menu has **Info**, including palette templates, the disabled start template, hats, reporters, and incomplete parked work. It opens a normal themed dialog with the block caption, a meaningful explanation, and architecture/word-width context. Instruction descriptions are shared with tooltips and explain native flag, stack, and CALL/RET behavior. This action never evaluates or executes code, edits fields, or adds a palette template to the workspace. Execution shortcuts do not fire while the dialog has focus. Breakpoints remain a separate action for workspace statements only.
- **Reporter identity is fixed.** Choose another register by dragging another reporter, not by editing a dropdown inside a reporter.
- **Select destinations.** Write targets use visibly distinct dropdowns. H is marked for its stack role; read-only PC is not offered as a destination.
- **Empty templates.** Palette examples contain empty white numeric shadows, not pre-inserted registers or expressions. An empty numeric field means zero; an empty condition means false.
- **Constants are edited in place.** A literal such as `5` in `mov eax, 5` is an operand, not an executable statement or an output. It does not need a standalone palette reporter or redundant click preview. Internal numeric shadows and older saved literals remain supported.
- **CMP is an instruction.** It stays violet at the beginning of Logic, with its statement shape and flag-setting behavior. It does not change register values. Boolean comparison reporters instead return values; they are not CMP statements.

### Events and labels

- The `start` hat has a small green play symbol. It is the single program entry point, not a "when green flag clicked" sentence. The existing hat can be moved; its palette template is disabled while one exists.
- Every label is its own entry hat without a top connection. Scripts do not fall through into unrelated hats because of their visual position.
- Only the start section and label sections reachable through jumps/calls are compiled and exported. Reachability follows references transitively and handles cycles; all conditional targets count as structurally reachable. Detached statements and unused label sections may remain incomplete without blocking execution, are not counted, and stay in saved workspace data. Referencing an unused section activates its validation. Editing ignored blocks does not reset CPU state.
- The compiler emits hidden section-ending jumps. They are real branches in exported source but do not introduce extra visible execution steps, including after CALL/RET.
- Label names are generated uniquely. Renaming a label updates jump references; jump destinations use dropdowns. `start` is reserved.
- Legacy inline labels migrate to separate event hats. Explicit jumps preserve the old fallthrough behavior. Migration is idempotent; existing independent sections stay independent. Modern saves carry `scratchsemblyWorkspaceVersion: 1` so parked statements without a start hat are not incorrectly wrapped as legacy entry scripts on reload or language changes.

### Input appearance and feedback

All block captions, numbers, and label names are bold. White captions on yellow event/control blocks have only a slight text shadow. Dark text inside white input pills does not need that shadow.

Dropdowns use their block's hue with a slightly darkened surface, a clear frame, squarer corners, white text, and a white downward arrow. Numeric and label text inputs remain white and rounded. Shape, borders, and cursor affordances matter as much as color, in both themes.

Blocks have no selection contour or rectangular focus frame. Normal HTML controls keep their keyboard focus rings. Dragging does not add yellow glows or recolor blocks: only the actual replacement socket gets a thin neutral outline, and statement insertion uses a faint silhouette. Feedback clears when leaving a target or dropping. The execution-only 3D/emboss effect remains on the executed statement, independent of selection.

Delete instructions and reporters by dragging them back into the palette. There is no trash can. The collapsed mobile category rail also accepts deletion; a hidden flyout must not retain an invisible deletion rectangle.

## Palette order

**Labels → Memory → Operators → Logic → Registers**

Labels combines start and label hats with jumps, CALL, and RET; all use the same yellow family. Registers combines MOV, ADD, SUB, INC, and DEC with orange register reporters, statements first. Memory combines PUSH, POP, memory writing, and the read reporter, all blue. There are no separate Events, Control, Commands, Values, or Stack categories.

CMP remains a violet comparison instruction at the beginning of Logic.

The category rail shares the palette background. Compact rounded category tabs have bold labels, small color capsules, and a category-colored border on the active tab. Palette refresh waits until a pointer gesture ends so a held reporter cannot change during a drag. On small screens the palette closes when a block is pulled out, freeing the target area; hidden scrollbars must not intercept workspace clicks.

## Project architecture

- **First visit:** With no valid saved project, immediately show a focused architecture chooser. Require explicit **Create project** confirmation before saving any workspace; Escape/backdrop clicks do not silently choose x86. Open a matching countdown example. Existing saved projects skip the chooser, including legacy projects without an architecture field.
- **File → New:** ARMv7-A/A32 with IDIV, AArch64/ARMv8-A, x86, or x86_64. The target changes only after confirming **Start fresh**. Canceling or changing language leaves the running project alone.
- **Persistence:** Architecture is a fixed project property. Files without it are x86. Unknown targets, invalid registers, and unrepresentable numbers are rejected before replacing the project. AArch64 keeps the internal ID `arm64` for compatibility.
- **Consistent views:** Header, register palette, destination menus, word width, stack slots, tooltips, mnemonics, and assembly syntax follow the project architecture together.
- **Exact 64-bit values:** BigInt and decimal strings avoid rounding beyond 2⁵³. AArch64 SP is 16-byte aligned. Each 16-byte stack slot contains one 8-byte value and 8 bytes of padding.
- **Native semantics:** ARM ADDS/SUBS set NZCV. Subtraction C means no borrow, unlike x86 CF. BL writes LR/X30; nested calls require explicit link-register preservation. PC is read-only; SP can be written subject to memory/alignment constraints.
- **Export checks:** NASM and Clang integration tests assemble the emitted subsets when those tools are installed.

## English default and localization

English is the initial language on every system, including German-language browsers and unavailable or invalid preference storage. English is listed first. An existing explicit English, German, or Assembly preference is preserved.

German remains available as **Deutsch**. Assembly mode uses English UI text and target-specific mnemonics; it does not choose an architecture. The document language follows the interface language, with Assembly using `en`. Blockly's context menus and dialogs follow the selected language too.

New example projects use English names and label names in English/Assembly modes. Saved project names and user-defined labels are never translated just because a language changes. Language changes preserve values, block structure, undo history, and the selected architecture.

Documentation, contributor guidance, and public-facing project metadata are written in English. German text in localization tables and explicit German regression fixtures is intentional.

## Light and dark appearance

The header moon/sun button has no persistent active highlight. The initial theme follows system appearance; an explicit choice is saved. Shared variables cover the workspace, palette, monitors, assembly, menus, dialogs, and Blockly popups outside the React root. Colored blocks and white numeric inputs stay readable.

Changing appearance must not rebuild the workspace, reset CPU state, or lose undo history.

## Technical boundaries to keep explicit

- The simulator implements integer subsets, not complete CPUs or operating systems. There is no Thumb, FPU/SIMD, MMU, interrupt handling, or OS integration.
- Integer division truncates toward zero; the remainder follows the left operand's sign. This is native integer behavior, not Scratch modulo.
- The compiler can use temporary stack space below H while evaluating nested values. It restores registers and modeled flags before the consuming instruction, except intentional destination/flag effects. Memory below H is scratch space, not protected data.
- Click previews use no temporary stack and read actual current memory.
- Failed visible blocks roll back partial simulated changes. Native export contains no foreign operating-system exception handler or automatic ABI setup.
- Register/stack state survives tab and language changes. CPU state, logs, and breakpoints are not permanently saved.
- Export is source, not a ready-to-run executable. Native stack, memory addresses, entry points, calling conventions, and OS integration remain the caller's responsibility.

See [README.md](../README.md) for target details, numeric semantics, limits, and compatibility keys.
