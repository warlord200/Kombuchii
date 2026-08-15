import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import type { DayTemp, Scenario } from "../model/model";

function asJson(value: DayTemp[] | Scenario[]): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function toIsoString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: "startDate must be a valid YYYY-MM-DD date" });

interface BatchShape {
  name: string;
  totalVolumeL: number;
  starterVolumeL: number;
  startDate: string;
  targetPh: number;
  roomOffsetC: number;
  lat: number | null;
  lon: number | null;
  locationName: string | null;
}

function toBatchData(input: BatchShape) {
  return {
    name: input.name,
    totalVolumeL: input.totalVolumeL,
    starterVolumeL: input.starterVolumeL,
    startDate: toIsoDate(input.startDate),
    targetPh: input.targetPh,
    roomOffsetC: input.roomOffsetC,
    lat: input.lat,
    lon: input.lon,
    locationName: input.locationName,
  };
}

const batchFieldDefs = {
  name: z.string().trim().min(1, "name is required"),
  totalVolumeL: z.number().positive("totalVolumeL must be positive"),
  starterVolumeL: z.number().positive("starterVolumeL must be positive"),
  startDate: isoDateSchema,
  targetPh: z.number().min(2.5, "targetPh must be between 2.5 and 3.5").max(3.5, "targetPh must be between 2.5 and 3.5"),
  roomOffsetC: z.number(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  locationName: z.string().nullable().optional(),
};

const createBatchSchema = z
  .object({
    ...batchFieldDefs,
    targetPh: batchFieldDefs.targetPh.default(3.0),
    roomOffsetC: batchFieldDefs.roomOffsetC.default(3.0),
  })
  .refine((b) => b.starterVolumeL < b.totalVolumeL, {
    message: "starterVolumeL must be less than totalVolumeL",
    path: ["starterVolumeL"],
  });

const updateBatchSchema = z
  .object(batchFieldDefs)
  .partial()
  .superRefine((b, ctx) => {
    if (b.starterVolumeL !== undefined && b.totalVolumeL !== undefined && b.starterVolumeL >= b.totalVolumeL) {
      ctx.addIssue({
        code: "custom",
        message: "starterVolumeL must be less than totalVolumeL",
        path: ["starterVolumeL"],
      });
    }
  });

export type CreateBatchInput = z.input<typeof createBatchSchema>;
export type UpdateBatchInput = z.input<typeof updateBatchSchema>;

export async function createBatch(input: CreateBatchInput) {
  const data = createBatchSchema.parse(input);
  return prisma.batch.create({
    data: toBatchData({
      name: data.name,
      totalVolumeL: data.totalVolumeL,
      starterVolumeL: data.starterVolumeL,
      startDate: data.startDate,
      targetPh: data.targetPh,
      roomOffsetC: data.roomOffsetC,
      lat: data.lat ?? null,
      lon: data.lon ?? null,
      locationName: data.locationName ?? null,
    }),
    include: { prediction: true },
  });
}

export async function getBatches() {
  return prisma.batch.findMany({
    orderBy: { createdAt: "desc" },
    include: { prediction: true },
  });
}

export async function getBatch(id: string) {
  return prisma.batch.findUnique({
    where: { id },
    include: { prediction: true },
  });
}

export async function updateBatch(id: string, input: UpdateBatchInput) {
  const patch = updateBatchSchema.parse(input);
  const existing = await prisma.batch.findUnique({ where: { id } });
  if (!existing) return null;

  const merged = {
    name: patch.name ?? existing.name,
    totalVolumeL: patch.totalVolumeL ?? existing.totalVolumeL,
    starterVolumeL: patch.starterVolumeL ?? existing.starterVolumeL,
    startDate: patch.startDate ?? toIsoString(existing.startDate),
    targetPh: patch.targetPh ?? existing.targetPh,
    roomOffsetC: patch.roomOffsetC ?? existing.roomOffsetC,
    lat: patch.lat !== undefined ? patch.lat : existing.lat,
    lon: patch.lon !== undefined ? patch.lon : existing.lon,
    locationName: patch.locationName !== undefined ? patch.locationName : existing.locationName,
  };
  createBatchSchema.parse(merged);

  return prisma.batch.update({
    where: { id },
    data: toBatchData(merged),
    include: { prediction: true },
  });
}

export async function deleteBatch(id: string): Promise<boolean> {
  const { count } = await prisma.batch.deleteMany({ where: { id } });
  return count > 0;
}

export async function getPrediction(batchId: string) {
  return prisma.prediction.findUnique({ where: { batchId } });
}

export async function upsertPrediction(batchId: string, days: DayTemp[], scenarios: Scenario[]) {
  const computedAt = new Date();
  return prisma.prediction.upsert({
    where: { batchId },
    create: { batchId, computedAt, days: asJson(days), scenarios: asJson(scenarios) },
    update: { computedAt, days: asJson(days), scenarios: asJson(scenarios) },
  });
}
