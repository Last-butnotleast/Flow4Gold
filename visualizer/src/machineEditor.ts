import {parseMachine,type Machine} from './machine';
export interface CatalogEntry {machine:string;version:number;definition:Machine;isDefault:boolean}
export interface MachineCatalog {machines:CatalogEntry[];default:{machine:string;version:number}}
export type EditorValidation={machine:Machine;error:null;line?:never;column?:never}|{machine:null;error:string;line?:number;column?:number};
export function validateEditor(source:string):EditorValidation {
  try{return {machine:parseMachine(JSON.parse(source)),error:null};}
  catch(error){const message=error instanceof Error?error.message:'Could not validate this definition.';
    if(error instanceof SyntaxError){const location=message.match(/line (\d+) column (\d+)/i);if(location)return {machine:null,error:message,line:Number(location[1]),column:Number(location[2])};const position=message.match(/position (\d+)/i);if(position){const prefix=source.slice(0,Number(position[1]));const lines=prefix.split('\n');return {machine:null,error:message,line:lines.length,column:lines.at(-1)!.length+1};}}
    return {machine:null,error:message};
  }
}
export const machineKey=(machine:Pick<Machine,'machine'|'version'>)=>`${machine.machine}@${machine.version}`;
export const sourceOf=(machine:Machine)=>JSON.stringify(machine,null,2)+'\n';
export function nextDraftVersion(machine:Machine,catalog:CatalogEntry[]):Machine {
  return {...machine,version:Math.max(machine.version,...catalog.filter(entry=>entry.machine===machine.machine).map(entry=>entry.version))+1};
}
