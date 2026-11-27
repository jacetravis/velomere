type Beat = "aside" | "drop" | "tuck";

export function shufflePose(beat: Beat, dir: number, seat: number, seatX: number) {
  const tuck = {
    top: `translate(${seatX}px, ${seat}px)`,
    shadow: `translate(${seatX}px, ${seat + 10}px)`,
    lift: 0.12,
    topZ: 2,
    bottomZ: 8,
  };
  if (beat === "aside") {
    return {
      top: `translate(${dir * -148}%, -2px) rotate(${dir * -12}deg)`,
      shadow: `translate(${dir * -136}%, 22px) rotate(${dir * -6}deg) scale(1.2)`,
      lift: 1,
      topZ: 6,
      bottomZ: 3,
    };
  }
  if (beat === "drop") {
    return {
      top: `translate(${dir * -148}%, ${seat + 10}px) rotate(${dir * -7}deg)`,
      shadow: `translate(${dir * -136}%, ${seat + 8}px) scale(1.08)`,
      lift: 0.3,
      topZ: 6,
      bottomZ: 3,
    };
  }
  return tuck;
}

/** Visual packet motion only. The original pose stays in shufflePose. */
export function optionalPose(style: string, beat: Beat, dir: number) {
  const square = { moving: "translate(0px, 0px) rotate(0deg)", resting: "translate(0px, 0px) rotate(0deg)", movingZ: 8, restZ: 3 };
  if (beat === "tuck") return square;
  if (style === "overhand") {
    if (beat === "aside") {
      return {
        moving: `translate(${dir * -18}%, -78%) rotate(${dir * -8}deg)`,
        resting: "translate(0px, 10%) rotate(0deg)",
        movingZ: 12,
        restZ: 2,
      };
    }
    return {
      moving: `translate(${dir * -6}%, 16%) rotate(${dir * -2}deg)`,
      resting: "translate(0px, 6%) rotate(0deg)",
      movingZ: 12,
      restZ: 2,
    };
  }
  if (style === "hindu") {
    if (beat === "aside") {
      return {
        moving: `translate(${dir * -130}%, -6%) rotate(${dir * 16}deg)`,
        resting: "translate(0px, 8%) rotate(0deg)",
        movingZ: 12,
        restZ: 2,
      };
    }
    return {
      moving: `translate(${dir * -22}%, 20%) rotate(${dir * 4}deg)`,
      resting: "translate(0px, 4%) rotate(0deg)",
      movingZ: 12,
      restZ: 2,
    };
  }
  if (style === "riffle_bridge") {
    if (beat === "aside") {
      return {
        moving: "translate(-78%, 0px) rotate(-7deg)",
        resting: "translate(78%, 0px) rotate(7deg)",
        movingZ: 8,
        restZ: 7,
      };
    }
    return {
      moving: "translate(-18%, -34%) rotate(-4deg)",
      resting: "translate(18%, -34%) rotate(4deg)",
      movingZ: 9,
      restZ: 8,
    };
  }
  if (style === "three_packet_cut") {
    if (beat === "aside") {
      return {
        moving: `translate(${dir * -90}%, 42%) rotate(${dir * -6}deg)`,
        resting: "translate(0px, -52%) rotate(0deg)",
        movingZ: 6,
        restZ: 8,
      };
    }
    return {
      moving: `translate(${dir * 70}%, 18%) rotate(${dir * 4}deg)`,
      resting: "translate(0px, -8%) rotate(0deg)",
      movingZ: 10,
      restZ: 4,
    };
  }
  return square;
}

export function stackCount(style: string) {
  if (style === "three_packet_cut") return 3;
  if (style === "table_wash") return 4;
  return 2;
}

/** Packets lift clear, travel around the deck, then land on top or slide underneath. */
export function stackMotion(style: string, beat: Beat, stack: number, dir: number, slot = stack) {
  const side = dir < 0 ? -1 : 1;
  const landed = [
    { transform: "translate(0px, -22%) rotate(2.5deg)", z: 24 },
    { transform: "translate(8%, 0px) rotate(-1.5deg)", z: 12 },
    { transform: "translate(-7%, 20%) rotate(1.5deg)", z: 4 },
  ];
  if (beat === "tuck" && style === "hindu") {
    return slot === 0
      ? { transform: `translate(${side * 22}%, -86%) rotate(${side * 7}deg)`, z: 24 }
      : { transform: `translate(${side * -18}%, 42%) rotate(${side * -4}deg)`, z: 6 };
  }
  if (beat === "tuck" && style === "three_packet_cut") {
    return landed[Math.min(landed.length - 1, Math.max(0, slot))] ?? landed[0];
  }
  const around: Record<string, { transform: string; z: number }[][]> = {
    overhand: [
      [
        { transform: `translate(${side * -6}%, -82%) rotate(${side * -8}deg)`, z: 16 },
        { transform: `translate(${side * -68}%, -8%) rotate(${side * -12}deg)`, z: 2 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 2 },
      ],
      [
        { transform: "translate(0px, 2%) rotate(0deg)", z: 8 },
        { transform: "translate(0px, 2%) rotate(0deg)", z: 12 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 12 },
      ],
    ],
    hindu: [
      [
        { transform: `translate(${side * 8}%, -78%) rotate(${side * 6}deg)`, z: 16 },
        { transform: `translate(${side * 74}%, -10%) rotate(${side * 14}deg)`, z: 16 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 18 },
      ],
      [
        { transform: "translate(0px, 3%) rotate(0deg)", z: 6 },
        { transform: `translate(${side * -6}%, 4%) rotate(0deg)`, z: 6 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 6 },
      ],
    ],
    riffle_bridge: [
      [
        { transform: "translate(-22%, -68%) rotate(-6deg)", z: 14 },
        { transform: "translate(-78%, 10%) rotate(-9deg)", z: 8 },
        { transform: "translate(-2%, 0px) rotate(0deg)", z: 8 },
      ],
      [
        { transform: "translate(22%, -60%) rotate(6deg)", z: 15 },
        { transform: "translate(78%, 6%) rotate(9deg)", z: 14 },
        { transform: "translate(2%, 0px) rotate(0deg)", z: 16 },
      ],
    ],
    three_packet_cut: [
      [
        { transform: `translate(${side * -10}%, -70%) rotate(${side * -4}deg)`, z: 12 },
        { transform: `translate(${side * -78}%, 30%) rotate(${side * -8}deg)`, z: 6 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 6 },
      ],
      [
        { transform: "translate(0px, -86%) rotate(1deg)", z: 18 },
        { transform: "translate(0px, -72%) rotate(2deg)", z: 18 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 18 },
      ],
      [
        { transform: `translate(${side * 10}%, -64%) rotate(${side * 4}deg)`, z: 13 },
        { transform: `translate(${side * 78}%, 24%) rotate(${side * 8}deg)`, z: 7 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 7 },
      ],
    ],
    table_wash: [
      [
        { transform: "translate(-16%, -70%) rotate(-4deg)", z: 12 },
        { transform: "translate(-64%, -22%) rotate(-8deg)", z: 8 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 8 },
      ],
      [
        { transform: "translate(16%, -66%) rotate(4deg)", z: 13 },
        { transform: "translate(64%, -18%) rotate(8deg)", z: 9 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 9 },
      ],
      [
        { transform: "translate(-12%, -78%) rotate(-3deg)", z: 17 },
        { transform: "translate(-52%, 36%) rotate(-6deg)", z: 16 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 18 },
      ],
      [
        { transform: "translate(12%, -74%) rotate(3deg)", z: 14 },
        { transform: "translate(52%, 32%) rotate(6deg)", z: 10 },
        { transform: "translate(0px, 0px) rotate(0deg)", z: 10 },
      ],
    ],
  };
  const steps = around[style]?.[stack] ?? around.overhand?.[0];
  const index = beat === "aside" ? 0 : beat === "drop" ? 1 : 2;
  return steps?.[index] ?? { transform: "translate(0px, 0px) rotate(0deg)", z: 8 };
}