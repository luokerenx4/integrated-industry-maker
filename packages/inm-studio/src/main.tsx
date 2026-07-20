import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { Billboard, Clone, Grid, Html, Line, OrbitControls, RoundedBox, Text, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import "./styles.css";

type Status = "idle" | "waiting-input" | "processing" | "blocked-output" | "unpowered" | "failed";
interface Device { id: string; assetId: string; name: string; behavior: string; position: { x: number; y: number }; rotation: number; footprint: { width: number; height: number }; visual: { shape?: string; height?: number; color?: string; label?: string; texture?: string | null; model?: string | null }; recipeDuration?: number }
interface Event { type: string; tick: number; device?: string; transit?: { id: string; material: string; count: number; departTick: number; arriveTick: number }; connection?: string }
interface Metrics { finalScore: number; throughputPerMinute: number; energyConsumedMilliJoules: number; totalBuildCost: number; occupiedArea: number; averageWip: number; bottleneckEntity: string | null; consumed: Record<string, number>; scoreBreakdown: Record<string, number> }
interface StudioData {
  name: string; blueprintHash: string; bounds: { width: number; height: number }; devices: Device[];
  connections: Array<{ id: string; fromDevice: string; toDevice: string; from: { x: number; y: number }; to: { x: number; y: number } }>;
  materials: Record<string, { visual?: { color?: string; shape?: string; texture?: string | null } }>; events: Event[]; metrics: Metrics | null;
  selectedRun: string | null; runs: Array<{ name: string; score: number; decision: string; resultHash: string }>;
}
interface DeviceFrame { status: Status; progress: number }
interface TransitFrame { id: string; material: string; progress: number; connection: string }

const STATUS_COLORS: Record<Status, string> = { idle: "#64748b", "waiting-input": "#818cf8", processing: "#22d3a7", "blocked-output": "#f59e0b", unpowered: "#a855f7", failed: "#ef4444" };
const STATUS_LABELS: Record<Status, string> = { idle: "IDLE", "waiting-input": "WAITING", processing: "RUNNING", "blocked-output": "BLOCKED", unpowered: "NO POWER", failed: "FAILED" };
const formatTick = (tick: number) => `${(tick / 1000).toFixed(1)}s`;

function buildFrame(data: StudioData, tick: number): { devices: Record<string, DeviceFrame>; transits: TransitFrame[]; visibleEvents: Event[] } {
  const devices = Object.fromEntries(data.devices.map((device) => [device.id, { status: "idle" as Status, progress: 0 }]));
  const starts = new Map<string, number>(); const transits = new Map<string, TransitFrame>(); const visibleEvents: Event[] = [];
  for (const event of data.events) {
    if (event.tick > tick) break; visibleEvents.push(event);
    if (event.device && event.type === "device.start") { devices[event.device] = { status: "processing", progress: 0 }; starts.set(event.device, event.tick); }
    else if (event.device && (event.type === "device.finish" || event.type === "device.recover" || event.type === "buffer.unblocked")) { devices[event.device] = { status: "idle", progress: 0 }; starts.delete(event.device); }
    else if (event.device && event.type === "buffer.blocked") devices[event.device] = { status: "blocked-output", progress: 0 };
    else if (event.device && event.type === "power.shortage") devices[event.device] = { status: "unpowered", progress: 0 };
    else if (event.device && event.type === "device.breakdown") devices[event.device] = { status: "failed", progress: 0 };
    else if (event.type === "material.depart" && event.transit && event.connection) transits.set(event.transit.id, { id: event.transit.id, material: event.transit.material, progress: 0, connection: event.connection });
    else if (event.type === "material.arrive" && event.transit) transits.delete(event.transit.id);
  }
  for (const device of data.devices) {
    const start = starts.get(device.id); if (start !== undefined && devices[device.id]?.status === "processing") devices[device.id]!.progress = Math.min(1, (tick - start) / Math.max(1, device.recipeDuration ?? 1));
  }
  for (const transit of transits.values()) {
    const depart = data.events.findLast((event) => event.type === "material.depart" && event.transit?.id === transit.id)?.transit;
    if (depart) transit.progress = Math.max(0, Math.min(1, (tick - depart.departTick) / Math.max(1, depart.arriveTick - depart.departTick)));
  }
  return { devices, transits: [...transits.values()], visibleEvents };
}

const fileUrl = (path: string) => `/files/${path.split("/").map(encodeURIComponent).join("/")}`;
function FactoryTexture({ path, color, processing }: { path: string; color: string; processing: boolean }) {
  const texture = useTexture(fileUrl(path)); texture.colorSpace = THREE.SRGBColorSpace;
  return <meshStandardMaterial map={texture} color={color} metalness={.32} roughness={.48} emissive={color} emissiveIntensity={processing ? .16 : .02} />;
}
function PrimitiveMaterial({ texture, color, processing }: { texture?: string | null; color: string; processing: boolean }) {
  return texture ? <FactoryTexture path={texture} color={color} processing={processing} /> : <meshStandardMaterial color={color} metalness={.45} roughness={.38} emissive={color} emissiveIntensity={processing ? .22 : .03} />;
}
function FactoryModel({ path, footprint, height }: { path: string; footprint: Device["footprint"]; height: number }) {
  const gltf = useGLTF(fileUrl(path)); const scale = Math.min(footprint.width, footprint.height, height);
  return <Clone object={gltf.scene} scale={scale} castShadow receiveShadow />;
}
function DeviceBody({ device, height, color, processing }: { device: Device; height: number; color: string; processing: boolean }) {
  if (device.visual.model) return <FactoryModel path={device.visual.model} footprint={device.footprint} height={height} />;
  const material = <PrimitiveMaterial texture={device.visual.texture} color={color} processing={processing} />;
  if (device.visual.shape === "cylinder") return <mesh castShadow receiveShadow><cylinderGeometry args={[device.footprint.width * .42, device.footprint.width * .48, height, 32]} />{material}</mesh>;
  if (device.visual.shape === "sphere") return <mesh castShadow receiveShadow><sphereGeometry args={[Math.min(device.footprint.width, device.footprint.height, height) * .48, 32, 24]} />{material}</mesh>;
  if (device.visual.shape === "plane") return <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow><boxGeometry args={[device.footprint.width * .88, device.footprint.height * .88, .12]} />{material}</mesh>;
  return <RoundedBox args={[device.footprint.width * .88, height, device.footprint.height * .88]} radius={.12} smoothness={4} castShadow receiveShadow>{material}</RoundedBox>;
}

function FactoryDevice({ device, frame, bottleneck }: { device: Device; frame: DeviceFrame; bottleneck: boolean }) {
  const h = device.visual.height ?? 1.25; const baseColor = device.visual.color ?? "#475569"; const color = frame.status === "idle" ? baseColor : STATUS_COLORS[frame.status];
  const position: [number, number, number] = [device.position.x + device.footprint.width / 2, h / 2, device.position.y + device.footprint.height / 2];
  return <group position={position} rotation={[0, -device.rotation * Math.PI / 180, 0]}>
    {bottleneck && <mesh position={[0, .03 - h / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[Math.max(device.footprint.width, device.footprint.height) * .7, Math.max(device.footprint.width, device.footprint.height) * .88, 48]} /><meshBasicMaterial color="#ffcf5c" transparent opacity={.8} /></mesh>}
    <DeviceBody device={device} height={h} color={color} processing={frame.status === "processing"} />
    <mesh position={[0, h / 2 + .04, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[device.footprint.width * .65 * frame.progress, .08]} /><meshBasicMaterial color="#d8fff4" /></mesh>
    <Billboard position={[0, h / 2 + .55, 0]}><Text fontSize={.28} color="#eef9ff" anchorY="bottom" outlineWidth={.015} outlineColor="#071117">{device.visual.label ?? device.name}</Text><Text position={[0, -.24, 0]} fontSize={.13} color={STATUS_COLORS[frame.status]}>{STATUS_LABELS[frame.status]}</Text></Billboard>
  </group>;
}

function FactoryWorld({ data, tick }: { data: StudioData; tick: number }) {
  const frame = useMemo(() => buildFrame(data, tick), [data, tick]);
  return <>
    <color attach="background" args={["#071014"]} />
    <fog attach="fog" args={["#071014", 30, 72]} />
    <hemisphereLight args={["#bcecff", "#102026", 1.15]} /><directionalLight position={[12, 24, 8]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
    <Grid args={[data.bounds.width, data.bounds.height]} position={[data.bounds.width / 2, 0, data.bounds.height / 2]} cellSize={1} cellThickness={.55} cellColor="#24414a" sectionSize={4} sectionThickness={1.1} sectionColor="#397080" fadeDistance={60} infiniteGrid={false} />
    <mesh position={[data.bounds.width / 2, -.04, data.bounds.height / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[data.bounds.width, data.bounds.height]} /><meshStandardMaterial color="#0b1a20" roughness={.92} metalness={.08} /></mesh>
    {data.connections.map((connection) => <Line key={connection.id} points={[[connection.from.x, .16, connection.from.y], [connection.to.x, .16, connection.to.y]]} color="#4f7680" lineWidth={3} transparent opacity={.9} />)}
    {data.devices.map((device) => <FactoryDevice key={device.id} device={device} frame={frame.devices[device.id] ?? { status: "idle", progress: 0 }} bottleneck={data.metrics?.bottleneckEntity === device.id} />)}
    {frame.transits.map((transit) => {
      const connection = data.connections.find((item) => item.id === transit.connection)!;
      const x = THREE.MathUtils.lerp(connection.from.x, connection.to.x, transit.progress); const z = THREE.MathUtils.lerp(connection.from.y, connection.to.y, transit.progress);
      const material = data.materials[transit.material]; const color = material?.visual?.color ?? "#d7f3ff";
      return <mesh key={transit.id} position={[x, .42, z]} castShadow>{material?.visual?.shape === "box" ? <boxGeometry args={[.28, .28, .28]} /> : material?.visual?.shape === "cylinder" ? <cylinderGeometry args={[.17, .17, .22, 16]} /> : <sphereGeometry args={[.16, 16, 16]} />}{material?.visual?.texture ? <FactoryTexture path={material.visual.texture} color={color} processing /> : <meshStandardMaterial color={color} emissive={color} emissiveIntensity={.55} />}</mesh>;
    })}
    <OrbitControls makeDefault target={[14, 0, 10]} minDistance={8} maxDistance={70} maxPolarAngle={Math.PI * .47} />
  </>;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>; }

function App() {
  const [data, setData] = useState<StudioData | null>(null); const [run, setRun] = useState<string | null>(null);
  const runRef = useRef<string | null>(null);
  const [tick, setTick] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(4); const [loading, setLoading] = useState(true);
  const load = useCallback(async (selected?: string | null) => {
    setLoading(true); const response = await fetch(`/api/data${selected ? `?run=${encodeURIComponent(selected)}` : ""}`); const next = await response.json() as StudioData;
    setData(next); setRun(next.selectedRun); runRef.current = next.selectedRun; setTick(0); setPlaying(false); setLoading(false);
  }, []);
  useEffect(() => { void load(); const source = new EventSource("/api/watch"); source.onmessage = (event) => { if (event.data === "refresh") void load(runRef.current); }; return () => source.close(); }, [load]);
  const maxTick = data?.events.at(-1)?.tick ?? 0;
  useEffect(() => {
    if (!playing || !data) return; let animation = 0; let previous = performance.now();
    const step = (now: number) => { const delta = now - previous; previous = now; setTick((value) => { const next = Math.min(maxTick, value + delta * speed); if (next >= maxTick) setPlaying(false); return next; }); animation = requestAnimationFrame(step); };
    animation = requestAnimationFrame(step); return () => cancelAnimationFrame(animation);
  }, [playing, speed, maxTick, data]);
  const frame = data ? buildFrame(data, tick) : null; const recent = frame?.visibleEvents.slice(-8).reverse() ?? [];
  if (!data) return <div className="loading">BOOTING FACTORY SCENE…</div>;
  return <main>
    <header><div className="brand"><div className="mark">INM</div><div><h1>{data.name}</h1><p>INTEGRATED INDUSTRY MAKER · READ-ONLY RUNTIME DEBUGGER</p></div></div><div className="header-tools"><span className="hash">BP {data.blueprintHash.slice(0, 10)}</span><button onClick={() => load(run)}>{loading ? "SYNCING" : "REFRESH"}</button></div></header>
    <section className="workspace">
      <div className="viewport"><Canvas shadows camera={{ position: [30, 20, 30], fov: 39, near: .1, far: 200 }} dpr={[1, 1.75]}><Suspense fallback={<Html center>Loading world…</Html>}><FactoryWorld data={data} tick={tick} /></Suspense></Canvas><div className="viewport-title"><span className="live-dot" /> FACTORY WORLD <b>{data.bounds.width}×{data.bounds.height}</b></div><div className="legend">{Object.entries(STATUS_COLORS).map(([status, color]) => <span key={status}><i style={{ background: color }} />{status}</span>)}</div></div>
      <aside>
        <div className="panel run-panel"><label>EXPERIMENT RUN</label><select value={run ?? ""} onChange={(event) => void load(event.target.value)}>{data.runs.map((item) => <option key={item.name} value={item.name}>{item.decision} · {item.name} · {item.score.toFixed(1)}</option>)}</select>{data.runs.find((item) => item.name === run) && <div className={`decision ${data.runs.find((item) => item.name === run)!.decision.toLowerCase()}`}>{data.runs.find((item) => item.name === run)!.decision}</div>}</div>
        <div className="panel"><h2>Performance</h2><div className="metrics"><Metric label="SCORE" value={data.metrics?.finalScore.toFixed(2) ?? "—"} accent /><Metric label="THROUGHPUT / MIN" value={data.metrics?.throughputPerMinute.toFixed(2) ?? "—"} /><Metric label="ENERGY" value={`${((data.metrics?.energyConsumedMilliJoules ?? 0) / 1e6).toFixed(1)} MJ`} /><Metric label="BUILD COST" value={(data.metrics?.totalBuildCost ?? 0).toLocaleString()} /><Metric label="AREA" value={`${data.metrics?.occupiedArea ?? 0} cells`} /><Metric label="AVG WIP" value={data.metrics?.averageWip.toFixed(2) ?? "—"} /></div></div>
        <div className="panel bottleneck"><h2>Bottleneck</h2><strong>{data.metrics?.bottleneckEntity ?? "NONE"}</strong><p>Highlighted with an amber floor beacon in the 3D world.</p></div>
        <div className="panel events"><h2>Event stream <span>{frame?.visibleEvents.length ?? 0}</span></h2>{recent.map((event, index) => <div className="event" key={`${event.tick}-${event.type}-${index}`}><time>{formatTick(event.tick)}</time><span>{event.type}</span><b>{event.device ?? event.transit?.material ?? ""}</b></div>)}</div>
      </aside>
    </section>
    <footer><button className="play" onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</button><button onClick={() => { setPlaying(false); setTick(0); }}>RESET</button><div className="time"><strong>{formatTick(tick)}</strong><input aria-label="Timeline" type="range" min={0} max={maxTick} value={tick} onChange={(event) => { setPlaying(false); setTick(Number(event.target.value)); }} /><span>{formatTick(maxTick)}</span></div><div className="speeds">{[1, 4, 16, 64].map((value) => <button className={speed === value ? "active" : ""} onClick={() => setSpeed(value)} key={value}>{value}×</button>)}</div></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
