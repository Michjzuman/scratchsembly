import { type CpuState, type Program } from "./cpu";
import { createState, executeBlock } from "./machine";

export type WorkerCommand =
  | { type: "load"; program: Program }
  | { type: "run" | "start"; delay: number; breakpoints: string[] }
  | { type: "step" | "pause" | "reset" }
  | { type: "speed"; delay: number }
  | { type: "breakpoints"; ids: string[] };

let state: CpuState = createState();
let program: Program = { instructions: [], labels: {} };
let timer: ReturnType<typeof setTimeout> | undefined;
let delay = 500;
let breakpoints: string[] = [];
let runSteps = 0;
const publish = () => self.postMessage(state);
const stop = () => {
  clearTimeout(timer);
  timer = undefined;
};
function tick() {
  if (state.status !== "running") return;
  const before = state.steps;
  executeBlock(state, program);
  runSteps += state.steps - before;
  if (
    state.status === "running" &&
    breakpoints.includes(program.instructions[state.pc]?.id)
  ) {
    state.status = "paused";
    state.message =
      "Breakpoint erreicht. Der markierte Block wird als Nächstes ausgeführt.";
  }
  if (state.status === "running" && runSteps >= 10000) {
    state.status = "paused";
    state.message =
      "Sicherheitslimit: 10.000 Schritte erreicht. Du kannst die Ausführung fortsetzen.";
  }
  publish();
  if (state.status === "running") timer = setTimeout(tick, delay);
}
self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;
  switch (command.type) {
    case "load":
      stop();
      program = command.program;
      state = createState(program.architecture);
      publish();
      break;
    case "reset":
      stop();
      state = createState(program.architecture);
      publish();
      break;
    case "pause":
      stop();
      if (state.status === "running") state.status = "paused";
      publish();
      break;
    case "step":
      stop();
      if (state.status === "running") state.status = "paused";
      executeBlock(state, program);
      publish();
      break;
    case "speed":
      delay = command.delay;
      break;
    case "breakpoints":
      breakpoints = command.ids;
      break;
    case "start":
    case "run":
      stop();
      if (command.type === "start") state = createState(program.architecture);
      if (!program.instructions.length) return;
      if (state.status === "finished" || state.status === "error")
        state = createState(program.architecture);
      delay = command.delay;
      breakpoints = command.breakpoints;
      runSteps = 0;
      if (
        state.status === "ready" &&
        breakpoints.includes(program.instructions[state.pc]?.id)
      ) {
        state.status = "paused";
        state.message =
          "Breakpoint erreicht. Der markierte Block wird als Nächstes ausgeführt.";
        publish();
      } else {
        state.status = "running";
        tick();
      }
      break;
  }
};
