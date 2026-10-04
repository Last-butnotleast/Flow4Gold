import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Code2,
  Cog,
  Diamond,
  Expand,
  FileJson,
  GitBranch,
  Layers2,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Search,
  Upload,
  X,
  Minus,
  RotateCcw,
} from "lucide-react";


import example from "../../machines/customer-refund.v1.json";

import v3 from "../../machines/customer-refund.v3.json";
import { parseMachine, type Machine } from "./machine";
import {api} from "./live";
import {validateEditor,machineKey,sourceOf,nextDraftVersion,type CatalogEntry,type MachineCatalog} from "./machineEditor";
import {graphBounds} from "./graphViewport";
import type { StateFlowNode, EventFlowEdge } from "./graph";
import { StateNode } from "./components/StateNode";
import { EventEdge } from "./components/EventEdge";

const nodeTypes = { state: StateNode };
const edgeTypes = { event: EventEdge };
const sample = parseMachine(example);
const icons = {
  initial: Play,
  final: CircleDot,
  decision: Diamond,
  task: Cog,
  waiting: Clock3,
  plain: Circle,
};
const kindLabels = {
  initial: "Initial state",
  final: "Final state",
  decision: "Decision",
  task: "Task",
  waiting: "Awaiting event",
  plain: "State",
};
const pretty = (value: string) =>
  value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
type Selection = { type: "state" | "event"; id: string } | null;

function saveJson(machine: Machine) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(machine, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${machine.machine}.v${machine.version}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function MachineExplorer() {
  const liveMode = false;
  const [machine, setMachine] = useState<Machine>(()=>parseMachine(v3));
  const [source,setSource]=useState(()=>sourceOf(parseMachine(v3)));
  const [baseline,setBaseline]=useState(()=>sourceOf(parseMachine(v3)));
  const [validatedSource,setValidatedSource]=useState(()=>sourceOf(parseMachine(v3)));
  const [validation,setValidation]=useState(()=>validateEditor(sourceOf(parseMachine(v3))));
  const [catalog,setCatalog]=useState<CatalogEntry[]>([]);
  const [catalogError,setCatalogError]=useState('');
  const [catalogLoading,setCatalogLoading]=useState(true);
  const [catalogReload,setCatalogReload]=useState(0);
  const [loadedKey,setLoadedKey]=useState('');
  const [runtimeDefault,setRuntimeDefault]=useState<{machine:string;version:number}|null>(null);
  const [savePending,setSavePending]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [saveMessage,setSaveMessage]=useState('');
  const [pendingDocument,setPendingDocument]=useState<{source:string;key:string;label:string}|null>(null);
  const touched=useRef(false);
  const editorRef=useRef<HTMLTextAreaElement>(null);
  const lineRef=useRef<HTMLDivElement>(null);
  const dirty=source!==baseline;
  const checking=source!==validatedSource;
  const stale=checking||!!validation.error;
  const sourceLines=source.split('\n').length;
  function loadDocument(next:{source:string;key:string;label:string}) {
    if(dirty){setPendingDocument(next);return;}
    applyDocument(next);
  }
  function applyDocument(next:{source:string;key:string;label:string}) {
    touched.current=true;setSource(next.source);setBaseline(next.source);setLoadedKey(next.key);setPendingDocument(null);setSaveError('');setSaveMessage('');
  }
  useEffect(()=>{
    const controller=new AbortController();setCatalogLoading(true);setCatalogError('');
    api<MachineCatalog>('/api/machines',undefined,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      const entries=result.machines.map(entry=>({...entry,definition:parseMachine(entry.definition)}));
      setCatalog(entries);setRuntimeDefault(result.default);
      if(!touched.current){const initial=entries.find(entry=>entry.isDefault)??entries[0];if(initial){const text=sourceOf(initial.definition);setSource(text);setBaseline(text);setLoadedKey(machineKey(initial));}}
    }).catch(reason=>{if(!controller.signal.aborted)setCatalogError(reason instanceof Error?reason.message:'Could not load saved definitions.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});
    return()=>controller.abort();
  },[catalogReload]);
  useEffect(()=>{
    const timer=setTimeout(()=>{const result=validateEditor(source);setValidation(result);setValidatedSource(source);if(result.machine)setMachine(result.machine);},350);
    return()=>clearTimeout(timer);
  },[source]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const editSource=(text:string)=>{touched.current=true;setSource(text);setSaveError('');setSaveMessage('');};
  async function saveDefinition(){
    const result=validateEditor(source);setValidation(result);setValidatedSource(source);if(!result.machine||savePending)return;
    setSavePending(true);setSaveError('');setSaveMessage('');const submitted=source;
    try{const saved=await api<{machine:CatalogEntry;created:boolean}>('/api/machines',{definition:result.machine});
      setCatalog(previous=>[...previous.filter(entry=>machineKey(entry)!==machineKey(saved.machine)),saved.machine].sort((a,b)=>a.machine.localeCompare(b.machine)||a.version-b.version));
      setBaseline(submitted);setLoadedKey(machineKey(saved.machine));setSaveMessage(saved.created?'New version saved. The runtime default has not changed.':'This exact version is already saved. No runtime changes.');
    }catch(reason){setSaveError(reason instanceof Error?reason.message:'Could not save this version.');}finally{setSavePending(false);}
  }
  function downloadSource(){const url=URL.createObjectURL(new Blob([source],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=validation.machine?`${validation.machine.machine}.v${validation.machine.version}.json`:'machine-draft.json';link.click();URL.revokeObjectURL(url);}
  const [graph, setGraph] = useState<{
    nodes: StateFlowNode[];
    edges: EventFlowEdge[];
  }>({ nodes: [], edges: [] });
  const [selection, setSelection] = useState<Selection>(null);
  const [inspector, setInspector] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);
  const { fitBounds, zoomIn, zoomOut, setCenter } = useReactFlow<
    StateFlowNode,
    EventFlowEdge
  >();

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setSelection(null);
    setQuery("");
    import("./graph")
      .then(({ layoutMachine }) => layoutMachine(machine))
      .then((result) => {
        if (!stale) {
          setGraph(result);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!stale) {
          setGraph({ nodes: [], edges: [] });
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not lay out this machine.",
          );
          setLoading(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [machine]);

  useEffect(() => {
    if (!graph.nodes.length) return;
    const timer = window.setTimeout(() => {
      void fitBounds(graphBounds(graph),{padding:0.08,duration:300});
    }, 80);
    return () => window.clearTimeout(timer);
  }, [graph, fitBounds]);

  useEffect(() => {
    const element=canvasRef.current;if(!element)return;
    let timer:ReturnType<typeof setTimeout>;
    const observer=new ResizeObserver(()=>{clearTimeout(timer);if(element.clientWidth && element.clientHeight)timer=setTimeout(()=>void fitBounds(graphBounds(graph),{padding:0.08}),100);});
    observer.observe(element);return()=>{observer.disconnect();clearTimeout(timer);};
  },[fitBounds,graph]);

  const select = useCallback((type: "state" | "event", id: string) => {
    setSelection({ type, id });
    setInspector(true);
  }, []);

  const focusState = (id: string) => {
    select("state", id);
    setQuery("");
    const node = graph.nodes.find((item) => item.id === id);
    if (node)
      void setCenter(node.position.x + 108, node.position.y + 40, {
        zoom: 1.05,
        duration: 450,
      });
  };

  const selectedNode =
    selection?.type === "state"
      ? graph.nodes.find((node) => node.id === selection.id)
      : undefined;
  const selectedEdge =
    selection?.type === "event"
      ? graph.edges.find((edge) => edge.id === selection.id)
      : undefined;
  const outgoing = graph.edges.filter(
    (edge) => edge.source === selectedNode?.id,
  );
  const incoming = graph.edges.filter(
    (edge) => edge.target === selectedNode?.id,
  );
  const matches = query.trim()
    ? graph.nodes.filter((node) =>
        `${node.id} ${pretty(node.id)}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : [];
  const decisionCount = graph.edges.filter(
    (edge) => edge.data?.kind === "decide",
  ).length;
  const taskCount = new Set(graph.nodes.flatMap((node) => node.data.tasks))
    .size;

  const related = useMemo(() => {
    if (!selection) return null;
    const ids = new Set<string>();
    if (selection.type === "state") {
      ids.add(selection.id);
      graph.edges.forEach((edge) => {
        if (edge.source === selection.id || edge.target === selection.id) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      });
    } else if (selectedEdge) {
      ids.add(selectedEdge.source);
      ids.add(selectedEdge.target);
    }
    return ids;
  }, [selection, graph.edges, selectedEdge]);

  const nodes = graph.nodes.map((node) => ({
    ...node,
    selected: selection?.type === "state" && selection.id === node.id,
    className:
      (related && !related.has(node.id)) ||
      (query.trim() && !matches.some((item) => item.id === node.id))
        ? "is-muted"
        : "",
  }));
  const edges = graph.edges.map((edge) => {
    const active =
      selection?.type === "event"
        ? selection.id === edge.id
        : selection?.type === "state"
          ? edge.source === selection.id || edge.target === selection.id
          : false;
    const traveled = false;
    const color = traveled ? "#218569" : edge.data?.kind === "decide" ? "#9b7bc6" : "#a4afb5";
    return {
      ...edge,
      selected: selection?.type === "event" && selection.id === edge.id,
      className: traveled ? "is-traveled" : selection ? (active ? "is-active" : "is-muted") : "",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: active ? "#626873" : color,
        width: 16,
        height: 16,
      },
      style: { stroke: color, strokeWidth: traveled ? 3 : active ? 2 : 1.4 },
      data: {
        ...edge.data!,
        onSelect: () => select("event", edge.id),
        dimmed: Boolean(selection && !active),
      },
    };
  });

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const sequence = ++importSequence.current;
    try {
      if (file.size > 2_000_000)
        throw new Error("Please choose a machine JSON file smaller than 2 MB.");
      const text = await file.text();
      if(sequence!==importSequence.current)return;
      setError('');
      loadDocument({source:text,key:'',label:file.name});
    } catch (reason) {
      if (sequence === importSequence.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not read that JSON file.",
        );
    }
  }

  function resetExample() {loadDocument({source:sourceOf(sample),key:'',label:'bundled example'});}

  const SelectedIcon = selectedNode ? icons[selectedNode.data.kind] : Layers2;

  return (
    <div className="explorer-shell machine-editor-shell">
      <header className="explorer-toolbar">
        <label className="explorer-version">Saved definitions <select aria-label="Saved definition" value={loadedKey} disabled={catalogLoading||savePending} onChange={event=>{const selected=catalog.find(entry=>machineKey(entry)===event.target.value);if(selected)loadDocument({source:sourceOf(selected.definition),key:machineKey(selected),label:`${selected.machine} v${selected.version}`});}}><option value="">{catalogLoading?'Loading catalog…':'Local draft / imported file'}</option>{catalog.map(entry=><option key={machineKey(entry)} value={machineKey(entry)}>{entry.machine} · v{entry.version}{entry.isDefault?' · runtime default':''}</option>)}</select></label>
        <div className="header-actions">
          <button className="button quiet" onClick={downloadSource}><ArrowDownToLine size={15}/><span>Download JSON</span></button>
          <button className="button" disabled={savePending} onClick={()=>inputRef.current?.click()}><Upload size={15}/><span>Import JSON</span></button>
          <button className="button primary" disabled={savePending||stale} onClick={()=>void saveDefinition()}>{savePending?<LoaderCircle size={15} className="spin"/>:<Check size={15}/>}<span>{savePending?'Saving…':'Save new version'}</span></button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            onChange={openFile}
            hidden
            aria-label="Open machine JSON"
          />
        </div>
      </header>

      <section className="workspace-heading">
        <div>
          <div className="eyebrow">
            <span className="small-dot" /> DOMAIN STATE MACHINE{" "}
            <span className="version-pill">v{machine.version}</span>
          </div>
          <h1>{pretty(machine.machine)}</h1>
          <p>Edit the JSON. Preview its process. Save immutable versions explicitly.</p>
        </div>
        <div className="heading-tools">
          <div className="search-wrap">
            <Search size={16} />
            <input
              aria-label="Find a state"
              placeholder="Find a state…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches.length)
                  focusState(matches[0].id);
                if (event.key === "Escape") setQuery("");
              }}
            />
            {query && (
              <button
                className="bare-button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={14} />
              </button>
            )}
            {query.trim() && (
              <div className="search-results" aria-label="Matching states">
                {matches.length ? (
                  matches.map((node) => (
                    <button key={node.id} onClick={() => focusState(node.id)}>
                      <span className={`kind-dot kind-${node.data.kind}`} />
                      {pretty(node.id)}
                      <ChevronRight size={14} />
                    </button>
                  ))
                ) : (
                  <p>No matching states</p>
                )}
              </div>
            )}
          </div>
          {!liveMode && <button
            className={`icon-button ${inspector ? "is-pressed" : ""}`}
            onClick={() => setInspector(!inspector)}
            aria-label={inspector ? "Hide inspector" : "Show inspector"}
            title={inspector ? "Hide inspector" : "Show inspector"}
          >
            {inspector ? (
              <PanelRightClose size={18} />
            ) : (
              <PanelRightOpen size={18} />
            )}
          </button>}
        </div>
      </section>

      <div className="machine-runtime-note"><span>Runtime default: <strong>{runtimeDefault?`${runtimeDefault.machine} v${runtimeDefault.version}`:'not loaded'}</strong></span><span>Saving or selecting a definition does not activate it. Custom machine previews do not imply task or business-policy support.</span></div>
      {catalogError&&<div className="editor-message error" role="alert">{catalogError}<button onClick={()=>setCatalogReload(value=>value+1)}>Retry catalog</button></div>}
      {pendingDocument&&<div className="editor-message discard-prompt" role="alert"><span>Replace unsaved edits with {pendingDocument.label}?</span><button className="button" onClick={()=>applyDocument(pendingDocument)}>Load & discard edits</button><button className="button" onClick={()=>setPendingDocument(null)}>Keep editing</button></div>}
      {saveError&&<div className="editor-message error" role="alert">{saveError}<span>For changes to a saved definition, increase its version before saving.</span></div>}
      {saveMessage&&<div className="editor-message success" role="status">{saveMessage}</div>}
      {error && (
        <div className="error-banner" role="alert">
          <FileJson size={18} />
          <span>{error}</span>
          <button
            className="bare-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <main className={`workspace editor-workspace ${inspector ? 'editor-inspecting' : ''}`}>
        <section className="machine-source-pane" aria-label="Machine JSON editor">
          <header><div><Code2 size={15}/><strong>machine.json</strong><span>{dirty?'Unsaved changes':loadedKey?'Saved version':'Local draft'}</span></div><button className="button quiet" disabled={savePending||stale} onClick={()=>{if(validation.machine)editSource(sourceOf(nextDraftVersion(validation.machine,catalog)));}}>Next version</button></header>
          <div className="source-code-area"><div className="source-line-numbers" ref={lineRef} aria-hidden="true">{Array.from({length:sourceLines},(_,index)=><div key={index}>{index+1}</div>)}</div><textarea ref={editorRef} aria-label="Machine JSON source" value={source} onChange={event=>editSource(event.target.value)} onScroll={event=>{if(lineRef.current)lineRef.current.scrollTop=event.currentTarget.scrollTop;}} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" disabled={savePending}/></div>
          <div className={`source-validation ${stale?'invalid':'valid'}`} role="status">{checking?'Checking changes… Preview shows the last valid definition.':validation.error?<><strong>Preview paused{validation.line?` · line ${validation.line}, column ${validation.column}`:''}</strong><span>{validation.error}</span><small>The graph still shows the last valid definition.</small></>:<><Check size={13}/><span>Valid definition · live preview</span></>}</div>
        </section>
        <section
          ref={canvasRef}
          className="canvas"
          aria-label="State machine canvas"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSelection(null);
          }}
        >
          <div className={`canvas-badge ${stale?'stale-preview':''}`}>
            <span className="live-dot" /> {stale ? "Last valid preview · stale" : "Live definition preview"}{" "}
            <span className="badge-divider" /> {graph.nodes.length} states ·{" "}
            {graph.edges.length} transitions
          </div>
          {loading && (
            <div className="loading">
              <LoaderCircle className="spin" size={22} /> Arranging your
              machine…
            </div>
          )}
          <ReactFlow<StateFlowNode, EventFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => select("state", node.id)}
            onEdgeClick={(_, edge) => select("event", edge.id)}
            onPaneClick={() => setSelection(null)}
            onNodesChange={(changes) => {
              const change = changes.find(
                (item) => item.type === "select" && item.selected,
              );
              if (change?.type === "select") select("state", change.id);
              else
                setSelection((current) =>
                  current?.type === "state" &&
                  changes.some(
                    (item) =>
                      item.type === "select" &&
                      !item.selected &&
                      item.id === current.id,
                  )
                    ? null
                    : current,
                );
            }}
            onEdgesChange={(changes) => {
              const change = changes.find(
                (item) => item.type === "select" && item.selected,
              );
              if (change?.type === "select") select("event", change.id);
              else
                setSelection((current) =>
                  current?.type === "event" &&
                  changes.some(
                    (item) =>
                      item.type === "select" &&
                      !item.selected &&
                      item.id === current.id,
                  )
                    ? null
                    : current,
                );
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            minZoom={0.2}
            maxZoom={1.8}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
            onMove={(_, viewport) => setZoom(viewport.zoom)}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.2}
              color="#dcded9"
            />
          </ReactFlow>
          <div className="canvas-bottom">
            <div className="legend" aria-label="State type legend">
              <span>
                <Diamond size={12} className="legend-decision" />
                Decision
              </span>
              <span>
                <Cog size={12} className="legend-task" />
                Task
              </span>
              <span>
                <Clock3 size={12} className="legend-waiting" />
                Wait
              </span>
              <span>
                <CircleDot size={12} className="legend-final" />
                Final
              </span>
            </div>
            <div className="zoom-controls">
              <button
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => void zoomOut({ duration: 200 })}
              >
                <Minus size={16} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => void zoomIn({ duration: 200 })}
              >
                <Plus size={16} />
              </button>
              <span className="control-divider" />
              <button
                aria-label="Fit diagram"
                title="Fit diagram"
                onClick={() =>
                  void fitBounds(graphBounds(graph),{padding:0.08,duration:400})
                }
              >
                <Expand size={17} />
              </button>
            </div>
          </div>
        </section>

        {!liveMode && inspector && (
          <aside className="inspector" aria-label="Machine inspector">
            <div className="inspector-top">
              <span>{selection ? "INSPECTOR" : "OVERVIEW"}</span>
              {selection ? (
                <button
                  className="bare-button"
                  onClick={() => setSelection(null)}
                  title="Back to overview"
                  aria-label="Back to overview"
                >
                  <ArrowLeft size={16} />
                </button>
              ) : (
                <span className="small-dot" />
              )}
            </div>
            <div className="inspector-scroll">
              {selectedNode ? (
                <>
                  <div className={`detail-icon kind-${selectedNode.data.kind}`}>
                    <SelectedIcon size={25} />
                  </div>
                  <div className="detail-kicker">
                    {kindLabels[selectedNode.data.kind]}
                  </div>
                  <h2>{pretty(selectedNode.id)}</h2>
                  <code className="state-id">{selectedNode.id}</code>
                  {selectedNode.data.initial && (
                    <div className="detail-callout">
                      <Play size={14} /> This is where the machine begins.
                    </div>
                  )}
                  {selectedNode.data.final && (
                    <div className="detail-callout">
                      <CircleDot size={15} /> Final state. The arriving event
                      carries the outcome.
                    </div>
                  )}
                  {selectedNode.data.tasks.length > 0 && (
                    <section className="detail-section">
                      <h3>
                        Tasks <span>{selectedNode.data.tasks.length}</span>
                      </h3>
                      {selectedNode.data.tasks.map((task) => (
                        <div className="task-row" key={task}>
                          <Cog size={15} />
                          <code>{task}</code>
                        </div>
                      ))}
                    </section>
                  )}
                  <section className="detail-section">
                    <h3>
                      Outgoing events <span>{outgoing.length}</span>
                    </h3>
                    {outgoing.length ? (
                      outgoing.map((edge) => (
                        <TransitionItem
                          key={edge.id}
                          edge={edge}
                          onClick={() => select("event", edge.id)}
                        />
                      ))
                    ) : (
                      <p className="muted-copy">No outgoing transitions.</p>
                    )}
                  </section>
                  {incoming.length > 0 && (
                    <section className="detail-section">
                      <h3>
                        Incoming events <span>{incoming.length}</span>
                      </h3>
                      {incoming.map((edge) => (
                        <TransitionItem
                          key={edge.id}
                          edge={edge}
                          incoming
                          onClick={() => select("event", edge.id)}
                        />
                      ))}
                    </section>
                  )}
                </>
              ) : selectedEdge ? (
                <>
                  <div
                    className={`detail-icon ${selectedEdge.data?.kind === "decide" ? "kind-decision" : "kind-plain"}`}
                  >
                    {selectedEdge.data?.kind === "decide" ? (
                      <Diamond size={25} />
                    ) : (
                      <ArrowRight size={25} />
                    )}
                  </div>
                  <div className="detail-kicker">
                    {selectedEdge.data?.kind === "decide"
                      ? "Decision event"
                      : "Event transition"}
                  </div>
                  <h2 className="event-heading">{selectedEdge.data?.event}</h2>
                  <div className="route-detail">
                    <button onClick={() => focusState(selectedEdge.source)}>
                      <span>FROM</span>
                      {pretty(selectedEdge.source)}
                      <ChevronRight size={14} />
                    </button>
                    <div className="route-connector">
                      <ArrowRight size={15} />
                    </div>
                    <button onClick={() => focusState(selectedEdge.target)}>
                      <span>TO</span>
                      {pretty(selectedEdge.target)}
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  {selectedEdge.data?.description && (
                    <section className="detail-section">
                      <h3>Decision criteria</h3>
                      <p className="description-copy">
                        {selectedEdge.data.description}
                      </p>
                    </section>
                  )}
                  {selectedEdge.data?.outcome && (
                    <section className="detail-section">
                      <h3>Outcome</h3>
                      <div className="outcome-value">
                        <CircleDot size={16} />
                        <code>{selectedEdge.data.outcome}</code>
                      </div>
                    </section>
                  )}
                  <div className="detail-section">
                    <h3>Defined in</h3>
                    <code className="source-path">
                      states.{selectedEdge.source}.{selectedEdge.data?.kind}
                    </code>
                  </div>
                </>
              ) : (
                <>
                  <div className="overview-symbol">
                    <GitBranch size={27} />
                  </div>
                  <h2>
                    A process,
                    <br />
                    made visible.
                  </h2>
                  <p className="overview-copy">
                    Follow the events. Explore the choices. Select any state or
                    transition to see what happens there.
                  </p>
                  <div className="stats-grid">
                    <div>
                      <strong>{graph.nodes.length}</strong>
                      <span>States</span>
                    </div>
                    <div>
                      <strong>{graph.edges.length}</strong>
                      <span>Transitions</span>
                    </div>
                    <div>
                      <strong>{decisionCount}</strong>
                      <span>Decisions</span>
                    </div>
                    <div>
                      <strong>{taskCount}</strong>
                      <span>Tasks</span>
                    </div>
                  </div>
                  <section className="detail-section state-index">
                    <h3>
                      States <span>{graph.nodes.length}</span>
                    </h3>
                    {graph.nodes.map((node) => {
                      const Icon = icons[node.data.kind];
                      return (
                        <button
                          key={node.id}
                          onClick={() => focusState(node.id)}
                        >
                          <span className={`index-icon kind-${node.data.kind}`}>
                            <Icon size={14} />
                          </span>
                          <span>{pretty(node.id)}</span>
                          {node.data.initial ? (
                            <span className="index-tag">START</span>
                          ) : node.data.final ? (
                            <span className="index-tag">END</span>
                          ) : (
                            <ChevronRight size={13} />
                          )}
                        </button>
                      );
                    })}
                  </section>
                </>
              )}
            </div>
            <div className="inspector-footer">
              <span>
                <FileJson size={14} /> Machine definition
              </span>
              <button
                className="bare-button"
                title="Download JSON"
                aria-label="Download machine JSON"
                onClick={() => saveJson(machine)}
              >
                <ArrowDownToLine size={16} />
              </button>
            </div>
          </aside>
        )}
      </main>
      <footer className="statusbar">
        <span>
          <span className="small-dot" /> {machine.machine}{" "}
          <span className="status-slash">/</span> v{machine.version}
        </span>
        <span className="canvas-hint">Scroll to zoom · Drag canvas to pan</span>
        <button onClick={resetExample}>
          <RotateCcw size={12} /> Load example
        </button>
      </footer>


    </div>
  );
}

function TransitionItem({
  edge,
  onClick,
  incoming = false,
}: {
  edge: EventFlowEdge;
  onClick: () => void;
  incoming?: boolean;
}) {
  return (
    <button
      className={`transition-item ${edge.data?.kind === "decide" ? "decision-transition" : ""}`}
      onClick={onClick}
    >
      <div>
        {edge.data?.kind === "decide" ? (
          <Diamond size={12} />
        ) : (
          <ArrowRight size={12} />
        )}
        <code>{edge.data?.event}</code>
      </div>
      <span>
        {incoming ? "From" : "To"}{" "}
        {pretty(incoming ? edge.source : edge.target)}
        <ChevronRight size={13} />
      </span>
    </button>
  );
}
