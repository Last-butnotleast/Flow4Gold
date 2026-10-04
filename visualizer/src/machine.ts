import {parseMachine as validateMachine} from '../../shared/machine-validation.mjs';
export interface Transition {
  [key: string]: unknown;
  target: string;
  description?: string;
  outcome?: string;
  taskResult?: boolean;
}

export interface MachineState {
  [key: string]: unknown;
  tasks?: string[];
  on?: Record<string, Transition>;
  decide?: Record<string, Transition>;
  final?: boolean;
  description?: string;
}

export interface Machine {
  [key: string]: unknown;
  machine: string;
  version: number;
  initial: string;
  states: Record<string, MachineState>;
}

/** Shared validation preserves source metadata and matches catalog saves. */
export function parseMachine(input:unknown):Machine {return validateMachine(input) as Machine;}
