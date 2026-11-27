"use client";

import { useEffect, useRef, useState } from "react";

const BACK = "/card-back.jpg";

function loadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("One card couldn't be prepared. Retry to reveal both."));
    image.src = url;
  });
}

export function WaitingBacks() {
  return (
    <div>
      <p className="text-sm text-subtle" role="status">Both cards stay face down while they are made.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
        {["Above", "Below"].map((label) => (
          <div key={label} className="min-w-0">
            <div className="edge-pulse overflow-hidden rounded-xl">
              <img src={BACK} alt="" draggable={false} className="aspect-[3.5/5.75] w-full object-cover" />
            </div>
            <p className="mt-2 text-center text-[11px] text-subtle">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PairedReveal({
  leftUrl,
  rightUrl,
  onDone,
  onFail,
}: {
  leftUrl: string;
  rightUrl: string;
  onDone: () => void;
  onFail?: () => void;
}) {
  const doneRef = useRef(onDone);
  const failRef = useRef(onFail);
  doneRef.current = onDone;
  failRef.current = onFail;
  const [ready, setReady] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [face, setFace] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    setReady(false);
    setFailed(false);
    setLifted(false);
    setFace(false);
    void Promise.all([loadImage(leftUrl), loadImage(rightUrl)])
      .then(() => {
        if (cancel) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setReady(true);
        if (reduce) {
          setFace(true);
          doneRef.current();
          return;
        }
        requestAnimationFrame(() => setLifted(true));
      })
      .catch(() => {
        if (cancel) return;
        setFailed(true);
        failRef.current?.();
      });
    return () => {
      cancel = true;
    };
  }, [leftUrl, rightUrl]);

  useEffect(() => {
    if (!lifted || face) return;
    const toEdge = window.setTimeout(() => setFace(true), 720);
    return () => window.clearTimeout(toEdge);
  }, [lifted, face]);

  useEffect(() => {
    if (!face || !lifted) return;
    const done = window.setTimeout(() => doneRef.current(), 760);
    return () => window.clearTimeout(done);
  }, [face, lifted]);

  // Outer edge pivots. Negative rotateY lifts the left card's inner (right) edge.
  // Positive rotateY lifts the right card's inner (left) edge.
  const pose = (side: "left" | "right") => {
    if (!lifted || face) return "rotateY(0deg)";
    return side === "left" ? "rotateY(-88deg)" : "rotateY(88deg)";
  };

  return (
    <div>
      <p className="text-sm text-subtle" role="status">{failed ? "One card couldn't be prepared. Retry to reveal both." : ready ? "Both cards are turning together." : "Preparing both cards."}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3" style={{ perspective: "900px" }}>
        {(["left", "right"] as const).map((side) => (
          <div key={side} className="min-w-0" style={{ perspective: "900px" }}>
            <div
              className="pointer-events-none aspect-[3.5/5.75] w-full overflow-hidden rounded-xl bg-surface"
              style={{
                transformOrigin: side === "left" ? "left center" : "right center",
                transform: pose(side),
                transition: "transform 700ms ease-in-out",
              }}
            >
              <img
                src={face ? (side === "left" ? leftUrl : rightUrl) : BACK}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-subtle">{side === "left" ? "Above" : "Below"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SingleReveal({
  url,
  onDone,
  onFail,
}: {
  url: string;
  onDone: () => void;
  onFail?: () => void;
}) {
  const doneRef = useRef(onDone);
  const failRef = useRef(onFail);
  doneRef.current = onDone;
  failRef.current = onFail;
  const [ready, setReady] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [face, setFace] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    setReady(false);
    setFailed(false);
    setLifted(false);
    setFace(false);
    void loadImage(url)
      .then(() => {
        if (cancel) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setReady(true);
        if (reduce) {
          setFace(true);
          doneRef.current();
          return;
        }
        requestAnimationFrame(() => setLifted(true));
      })
      .catch(() => {
        if (cancel) return;
        setFailed(true);
        failRef.current?.();
      });
    return () => {
      cancel = true;
    };
  }, [url]);

  useEffect(() => {
    if (!lifted || face) return;
    const toEdge = window.setTimeout(() => setFace(true), 720);
    return () => window.clearTimeout(toEdge);
  }, [lifted, face]);

  useEffect(() => {
    if (!face || !lifted) return;
    const done = window.setTimeout(() => doneRef.current(), 760);
    return () => window.clearTimeout(done);
  }, [face, lifted]);

  const pose = !lifted || face ? "rotateY(0deg)" : "rotateY(88deg)";

  return (
    <div className="min-w-0">
      <p className="text-[11px] text-subtle">{failed ? "This card couldn't be prepared." : ready ? "The new card is turning." : "Preparing the new card."}</p>
      <div className="mt-2" style={{ perspective: "900px" }}>
        <div
          className="pointer-events-none aspect-[3.5/5.75] w-full overflow-hidden rounded-xl bg-surface"
          style={{
            transformOrigin: "right center",
            transform: pose,
            transition: "transform 700ms ease-in-out",
          }}
        >
          <img src={face ? url : BACK} alt="" draggable={false} className="h-full w-full object-cover" />
        </div>
      </div>
    </div>
  );
}
