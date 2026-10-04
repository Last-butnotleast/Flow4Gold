export type Screen='demo'|'orders'|'explorer';
export interface Draft {message:string;orderReference:string}
export interface RecentCase {caseId:string;state?:string}
export function screenFromSearch(search:string):Screen {const params=new URLSearchParams(search);const view=params.get('view');return view==='orders'||view==='explorer'?view:'demo';}
export function addRecentCase(cases:RecentCase[],next:RecentCase){return [next,...cases.filter(item=>item.caseId!==next.caseId)].slice(0,12);}
export function attachToNewDraft(draft:Draft|undefined,orderReference:string):Draft{return {message:draft?.message??'',orderReference};}
