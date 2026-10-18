"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FILTERS, getFilter, resolveParams } from "@lumen/core";
import { swatchGradient } from "@/lib/swatch";
import { GradeRenderer } from "@/lib/webglGrade";

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running" }
  | { kind: "denied" }
  | { kind: "unavailable"; reason: string };

export function CameraDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rendererRef = useRef<GradeRenderer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const paramsRef = useRef(resolveParams(getFilter("natural"), getFilter("natural").defaultIntensity));
  const mirrorRef = useRef(true);

  const [state, setState] = useState<State>({ kind: "idle" });
  const [filterId, setFilterId] = useState("natural");
  const [intensity, setIntensity] = useState(getFilter("natural").defaultIntensity);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [shot, setShot] = useState<string | null>(null);

  const swatches = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, swatchGradient(f)])), []);

  useEffect(() => {
    paramsRef.current = resolveParams(getFilter(filterId), intensity);
  }, [filterId, intensity]);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: "user" | "environment") => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ kind: "unavailable", reason: "This browser can’t access a camera. Try a recent Chrome, Safari, Edge or Firefox." });
        return;
      }
      stop();
      setState({ kind: "starting" });
      try {
        if (!rendererRef.current) rendererRef.current = new GradeRenderer(canvasRef.current!);
      } catch {
        setState({ kind: "unavailable", reason: "This browser doesn’t support WebGL, which the live filters need." });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current ?? document.createElement("video");
        videoRef.current = video;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        mirrorRef.current = mode === "user";
        setState({ kind: "running" });

        const loop = () => {
          const v = videoRef.current;
          const r = rendererRef.current;
          if (v && r && v.readyState >= 2 && v.videoWidth > 0) {
            r.render(v, paramsRef.current, v.videoWidth, v.videoHeight, mirrorRef.current);
          }
          frameRef.current = requestAnimationFrame(loop);
        };
        frameRef.current = requestAnimationFrame(loop);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") setState({ kind: "denied" });
        else if (name === "NotFoundError" || name === "OverconstrainedError")
          setState({ kind: "unavailable", reason: "No camera was found on this device." });
        else setState({ kind: "unavailable", reason: "The camera couldn’t be started. It may be in use by another app." });
      }
    },
    [stop],
  );

  // Release the camera when the tab is hidden or the page is left.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && streamRef.current) {
        stop();
        setState({ kind: "idle" });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [stop]);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot);
  }, [shot]);

  const capture = async () => {
    const r = rendererRef.current;
    if (!r) return;
    const blob = await r.toBlob("image/jpeg", 0.92);
    setShot(URL.createObjectURL(blob));
  };

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    start(next);
  };

  const filter = getFilter(filterId);

  return (
    <div>
      <div className="viewfinder">
        <canvas ref={canvasRef} aria-label={`Live camera preview with the ${filter.name} filter`} role="img" />
        {state.kind !== "running" && (
          <div className="state" role="status">
            {state.kind === "idle" && (
              <>
                <p>Your browser will ask for camera access. The video is processed on your device and never uploaded.</p>
                <button className="btn btn-primary" onClick={() => start(facing)}>
                  Start camera
                </button>
              </>
            )}
            {state.kind === "starting" && <p>Starting camera…</p>}
            {state.kind === "denied" && (
              <>
                <p>Camera access was blocked. Allow it in your browser’s site settings, then try again.</p>
                <button className="btn btn-primary" onClick={() => start(facing)}>
                  Try again
                </button>
              </>
            )}
            {state.kind === "unavailable" && <p>{state.reason}</p>}
          </div>
        )}
      </div>

      <div className="chips" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={f.id === filterId}
            onClick={() => {
              setFilterId(f.id);
              setIntensity(f.defaultIntensity);
            }}
          >
            <span className="swatch" style={{ background: swatches[f.id] }} aria-hidden="true" />
            {f.name}
          </button>
        ))}
      </div>

      <div className="controls-row">
        <label htmlFor="intensity">Intensity</label>
        <input
          id="intensity"
          type="range"
          min={0}
          max={100}
          value={Math.round(intensity * 100)}
          onChange={(e) => setIntensity(Number(e.target.value) / 100)}
          disabled={filterId === "original"}
          aria-valuetext={`${Math.round(intensity * 100)} percent`}
        />
        <span aria-hidden="true" style={{ minWidth: 40 }}>
          {Math.round(intensity * 100)}%
        </span>
      </div>

      <div className="controls-row">
        <button className="btn btn-primary" onClick={capture} disabled={state.kind !== "running"}>
          Take photo
        </button>
        <button className="btn" onClick={flip} disabled={state.kind !== "running"}>
          Switch camera
        </button>
      </div>

      {shot && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob from the canvas */}
          <img className="shot" src={shot} alt={`Photo taken with the ${filter.name} filter`} />
          <p>
            <a className="btn" href={shot} download={`lumen-${filter.id}.jpg`}>
              Download photo
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
