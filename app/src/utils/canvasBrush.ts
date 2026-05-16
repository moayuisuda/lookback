export interface BrushPoint {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
  pointerType?: string;
}

export interface BrushSample extends BrushPoint {
  radius: number;
}

const formatBrushNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

export const getBrushMoveCommand = (point: BrushPoint) =>
  `M ${formatBrushNumber(point.x)} ${formatBrushNumber(point.y)}`;

// 绘制中增量追加：只生成一个 L 命令，O(1) 开销
export const getBrushLineToCommand = (point: BrushPoint) =>
  `L ${formatBrushNumber(point.x)} ${formatBrushNumber(point.y)}`;

const getDistance = (a: BrushPoint, b: BrushPoint) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerpNumber = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

const normalizeVector = (x: number, y: number) => {
  const length = Math.hypot(x, y);
  if (length <= 0.0001) return null;
  return { x: x / length, y: y / length };
};

const isPressurePointer = (point: BrushPoint) =>
  point.pointerType === "pen" || point.pointerType === "touch";

const normalizeTimestamp = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return Date.now();
  return value;
};

const normalizePressure = (point: BrushPoint) => {
  const value = point.pressure;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  if (!isPressurePointer(point)) return 0.5;
  return clampNumber(value, 0.02, 1);
};

export const createBrushPoint = (point: BrushPoint): BrushPoint => ({
  x: point.x,
  y: point.y,
  pressure: normalizePressure(point),
  timestamp: normalizeTimestamp(point.timestamp),
  pointerType: point.pointerType,
});

const interpolatePoint = (
  start: BrushPoint,
  end: BrushPoint,
  amount: number,
): BrushPoint => ({
  x: lerpNumber(start.x, end.x, amount),
  y: lerpNumber(start.y, end.y, amount),
  pressure: lerpNumber(
    normalizePressure(start),
    normalizePressure(end),
    amount,
  ),
  timestamp: lerpNumber(
    normalizeTimestamp(start.timestamp),
    normalizeTimestamp(end.timestamp),
    amount,
  ),
  pointerType: end.pointerType || start.pointerType,
});

const removeDuplicatePoints = (points: BrushPoint[]) => {
  const cleaned: BrushPoint[] = [];
  points.forEach((point) => {
    const previousPoint = cleaned[cleaned.length - 1];
    if (previousPoint && getDistance(previousPoint, point) < 0.15) return;
    cleaned.push(point);
  });
  return cleaned;
};

const resamplePoints = (points: BrushPoint[], spacing: number) => {
  if (points.length <= 2) return points;

  const resampled: BrushPoint[] = [points[0]];
  let remaining = spacing;

  for (let index = 1; index < points.length; index += 1) {
    let start = points[index - 1];
    const end = points[index];
    let segmentLength = getDistance(start, end);

    while (segmentLength >= remaining) {
      const amount = remaining / segmentLength;
      const nextPoint = interpolatePoint(start, end, amount);
      resampled.push(nextPoint);
      start = nextPoint;
      segmentLength = getDistance(start, end);
      remaining = spacing;
    }

    remaining -= segmentLength;
  }

  const lastPoint = points[points.length - 1];
  const lastResampledPoint = resampled[resampled.length - 1];
  if (lastResampledPoint && getDistance(lastResampledPoint, lastPoint) > 0.2) {
    resampled.push(lastPoint);
  }

  return resampled;
};

const smoothPoints = (points: BrushPoint[], iterations: number) => {
  let current = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (current.length < 4) return current;
    const next: BrushPoint[] = [current[0]];

    for (let index = 0; index < current.length - 1; index += 1) {
      const start = current[index];
      const end = current[index + 1];
      next.push(interpolatePoint(start, end, 0.25));
      next.push(interpolatePoint(start, end, 0.75));
    }

    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
};

const getPointVelocity = (previousPoint: BrushPoint, point: BrushPoint) => {
  const deltaTime = Math.max(
    4,
    normalizeTimestamp(point.timestamp) -
      normalizeTimestamp(previousPoint.timestamp),
  );
  return getDistance(previousPoint, point) / deltaTime;
};

const getTargetRadius = (
  point: BrushPoint,
  previousPoint: BrushPoint | null,
  strokeWidth: number,
) => {
  const pressure = normalizePressure(point);
  const pressureFactor = isPressurePointer(point) ? 0.22 + pressure * 1.25 : 1;
  const velocity = previousPoint ? getPointVelocity(previousPoint, point) : 0;
  const speed = clampNumber(velocity / 1.2, 0, 1);
  const velocityFactor = 1.28 - Math.sqrt(speed) * 0.62;
  return Math.max(0.65, (strokeWidth / 2) * pressureFactor * velocityFactor);
};

export const buildSamples = (points: BrushPoint[], strokeWidth: number) => {
  let previousRadius: number | null = null;
  return points.map((point, index) => {
    const targetRadius = getTargetRadius(
      point,
      index > 0 ? points[index - 1] : null,
      strokeWidth,
    );
    const radius =
      previousRadius === null
        ? targetRadius
        : previousRadius * 0.72 + targetRadius * 0.28;
    previousRadius = radius;
    return { ...point, radius };
  });
};

const buildRoundDabPath = (sample: BrushSample) => {
  const radius = sample.radius;
  const control = radius * 0.5522847498;
  const x = formatBrushNumber(sample.x);
  const y = formatBrushNumber(sample.y);

  return [
    `M ${formatBrushNumber(sample.x + radius)} ${y}`,
    `C ${formatBrushNumber(sample.x + radius)} ${formatBrushNumber(sample.y + control)} ${formatBrushNumber(sample.x + control)} ${formatBrushNumber(sample.y + radius)} ${x} ${formatBrushNumber(sample.y + radius)}`,
    `C ${formatBrushNumber(sample.x - control)} ${formatBrushNumber(sample.y + radius)} ${formatBrushNumber(sample.x - radius)} ${formatBrushNumber(sample.y + control)} ${formatBrushNumber(sample.x - radius)} ${y}`,
    `C ${formatBrushNumber(sample.x - radius)} ${formatBrushNumber(sample.y - control)} ${formatBrushNumber(sample.x - control)} ${formatBrushNumber(sample.y - radius)} ${x} ${formatBrushNumber(sample.y - radius)}`,
    `C ${formatBrushNumber(sample.x + control)} ${formatBrushNumber(sample.y - radius)} ${formatBrushNumber(sample.x + radius)} ${formatBrushNumber(sample.y - control)} ${formatBrushNumber(sample.x + radius)} ${y}`,
    "Z",
  ].join(" ");
};

const getSampleNormal = (samples: BrushSample[], index: number) => {
  const previous = samples[index - 1] ?? null;
  const current = samples[index];
  const next = samples[index + 1] ?? null;
  const previousVector = previous
    ? normalizeVector(current.x - previous.x, current.y - previous.y)
    : null;
  const nextVector = next
    ? normalizeVector(next.x - current.x, next.y - current.y)
    : null;
  const tangent =
    previousVector && nextVector
      ? (normalizeVector(
          previousVector.x + nextVector.x,
          previousVector.y + nextVector.y,
        ) ?? nextVector)
      : (previousVector ?? nextVector);
  if (!tangent) return { x: 0, y: -1 };
  return { x: -tangent.y, y: tangent.x };
};

const getEndpointTangent = (
  samples: BrushSample[],
  index: number,
  direction: 1 | -1,
) => {
  const current = samples[index];
  const targetIndex = index + direction;
  const target = samples[targetIndex];
  if (!target) return { x: 1, y: 0 };
  const tangent =
    direction === 1
      ? normalizeVector(target.x - current.x, target.y - current.y)
      : normalizeVector(current.x - target.x, current.y - target.y);
  return tangent ?? { x: 1, y: 0 };
};

const formatLineToCommand = (point: BrushPoint) =>
  `L ${formatBrushNumber(point.x)} ${formatBrushNumber(point.y)}`;

const formatQuadraticCommand = (control: BrushPoint, point: BrushPoint) =>
  `Q ${formatBrushNumber(control.x)} ${formatBrushNumber(control.y)} ${formatBrushNumber(point.x)} ${formatBrushNumber(point.y)}`;

const buildOutlineStrokePath = (samples: BrushSample[]) => {
  if (samples.length === 1) return buildRoundDabPath(samples[0]);

  const left: BrushPoint[] = [];
  const right: BrushPoint[] = [];

  samples.forEach((sample, index) => {
    const normal = getSampleNormal(samples, index);
    left.push({
      x: sample.x + normal.x * sample.radius,
      y: sample.y + normal.y * sample.radius,
    });
    right.push({
      x: sample.x - normal.x * sample.radius,
      y: sample.y - normal.y * sample.radius,
    });
  });

  const first = samples[0];
  const last = samples[samples.length - 1];
  const startTangent = getEndpointTangent(samples, 0, 1);
  const endTangent = getEndpointTangent(samples, samples.length - 1, -1);
  const endControl = {
    x: last.x + endTangent.x * last.radius,
    y: last.y + endTangent.y * last.radius,
  };
  const startControl = {
    x: first.x - startTangent.x * first.radius,
    y: first.y - startTangent.y * first.radius,
  };

  const commands = [getBrushMoveCommand(left[0])];
  left.slice(1).forEach((point) => commands.push(formatLineToCommand(point)));
  commands.push(formatQuadraticCommand(endControl, right[right.length - 1]));
  right
    .slice(0, -1)
    .reverse()
    .forEach((point) => commands.push(formatLineToCommand(point)));
  commands.push(formatQuadraticCommand(startControl, left[0]));
  commands.push("Z");
  return commands.join(" ");
};

export const buildBrushCanvasPath = (
  rawPoints: BrushPoint[],
  strokeWidth: number,
) => {
  const cleanedPoints = removeDuplicatePoints(rawPoints.map(createBrushPoint));
  if (cleanedPoints.length === 0) return "";
  if (cleanedPoints.length === 1) return getBrushMoveCommand(cleanedPoints[0]);

  // 最终 SVG 只保留连续轮廓，采样密度不再需要按 dab 间距铺满，避免缩放时重绘超长路径。
  const spacing = Math.max(1.8, strokeWidth * 0.28);
  const centerline = smoothPoints(resamplePoints(cleanedPoints, spacing), 1);
  const samples = buildSamples(centerline, strokeWidth);
  return buildOutlineStrokePath(samples);
};

export const getFilteredBrushPoint = (
  previousPoint: BrushPoint,
  nextPoint: BrushPoint,
  strokeWidth: number,
  viewportScale: number,
) => {
  const distance = getDistance(nextPoint, previousPoint);
  const jitterRadius = Math.max(0.25 / viewportScale, strokeWidth * 0.04);
  const alpha =
    distance <= jitterRadius
      ? 0.28
      : Math.min(0.86, Math.max(0.5, distance / Math.max(strokeWidth * 2.5, 1)));

  return {
    x: lerpNumber(previousPoint.x, nextPoint.x, alpha),
    y: lerpNumber(previousPoint.y, nextPoint.y, alpha),
    pressure: nextPoint.pressure,
    timestamp: nextPoint.timestamp,
    pointerType: nextPoint.pointerType,
  };
};
