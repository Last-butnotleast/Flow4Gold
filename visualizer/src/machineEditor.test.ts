import {describe,it,expect,vi} from 'vitest';
import {validateEditor,nextDraftVersion,sourceOf,type CatalogEntry} from './machineEditor';
import {parseMachine} from './machine';
const machine=parseMachine({machine:'order-fulfilment',version:1,initial:'OPEN',states:{OPEN:{on:{PACKED:{target:'DONE'}}},DONE:{final:true}},metadata:{note:'keep me'}});
describe('machine source editor',()=>{
  it('validates arbitrary machine names and preserves source metadata',()=>{const result=validateEditor(sourceOf(machine));expect(result.error).toBeNull();expect(result.machine?.machine).toBe('order-fulfilment');expect(result.machine?.metadata).toEqual({note:'keep me'});});
  it('reports a syntax error without producing a replacement graph definition',()=>{const result=validateEditor('{\n "machine": ,\n}');expect(result.machine).toBeNull();expect(result.error).toBeTruthy();expect(result.error).toMatch(/JSON|token|property/i);});
  it('preserves line and column when the JSON engine provides them',()=>{const parser=vi.spyOn(JSON,'parse').mockImplementationOnce(()=>{throw new SyntaxError('Unexpected token at position 15 (line 2 column 14)');});try{expect(validateEditor('{\n "machine": ,\n}')).toMatchObject({machine:null,line:2,column:14});}finally{parser.mockRestore();}});
  it('reports an actionable unknown-target semantic error',()=>{const definition=structuredClone(machine);definition.states.OPEN.on!.PACKED.target='MISSING';const result=validateEditor(sourceOf(definition));expect(result.machine).toBeNull();expect(result.error).toMatch(/unknown state.*MISSING/);});
  it('rejects terminal tasks using the same rules as catalog persistence',()=>{const definition=structuredClone(machine);definition.states.DONE.tasks=['run'];expect(validateEditor(sourceOf(definition)).error).toMatch(/final|terminal/i);});
  it('creates a new version after all saved versions without changing the prior definition',()=>{const catalog=[{machine:machine.machine,version:7,definition:{...machine,version:7},isDefault:false}] as CatalogEntry[];const next=nextDraftVersion(machine,catalog);expect(next.version).toBe(8);expect(machine.version).toBe(1);expect(next.states).toEqual(machine.states);});
});
