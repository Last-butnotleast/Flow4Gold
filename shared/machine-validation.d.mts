export function parseMachine(input: unknown): unknown;
export function canonicalJson(input: unknown): string;
export function parseMachineCatalog(rows: unknown): {machines: Array<{machine: string; version: number; definition: unknown; isDefault: boolean}>; default: {machine: string; version: number}};

export function parseMachineDefinitions(rows: unknown): Array<{machine: string; version: number; initial: string; states: Record<string, unknown>}>;
