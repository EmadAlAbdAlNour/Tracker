import { z } from "zod";

export const loginSchema = z.object({
  emailOrPhone: z.string().trim().min(3).max(255),
  password: z.string().min(8).max(200),
  device: z
    .object({
      platform: z.string().trim().min(1).max(50),
      deviceIdentifier: z.string().trim().min(1).max(255).optional().or(z.literal("")),
      appVersion: z.string().trim().min(1).max(50).optional().or(z.literal("")),
    })
    .optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const driverCreateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
  employeeId: z.string().trim().min(2).max(50),
  password: z.string().min(8).max(200),
  active: z.boolean().default(true),
});

export const driverUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
  employeeId: z.string().trim().min(2).max(50).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export const deviceRegisterSchema = z.object({
  platform: z.string().trim().min(1).max(50),
  deviceIdentifier: z.string().trim().min(1).max(255).optional().or(z.literal("")),
  appVersion: z.string().trim().min(1).max(50).optional().or(z.literal("")),
});

export const locationPointSchema = z.object({
  clientLocationId: z.string().trim().min(1).max(255).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  altitude: z.number().nullable().optional(),
  speed: z.number().min(0).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  recordedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "recordedAt must be a valid ISO timestamp",
  }),
  source: z.string().trim().min(1).max(50).default("mobile"),
  batteryPercentage: z.number().int().min(0).max(100).nullable().optional(),
  isCharging: z.boolean().nullable().optional(),
  locationServicesEnabled: z.boolean().nullable().optional(),
  networkStatus: z.string().trim().max(50).nullable().optional(),
});

export const locationBatchSchema = z.array(locationPointSchema).min(1).max(20);

export const shiftListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "COMPLETED"]).optional(),
  from: z.coerce.string().optional(),
  to: z.coerce.string().optional(),
});

export const heartbeatSchema = z.object({
  shiftId: z.string().uuid().optional(),
  batteryPercentage: z.number().int().min(0).max(100).nullable().optional(),
  isCharging: z.boolean().nullable().optional(),
  locationServicesEnabled: z.boolean().nullable().optional(),
  networkStatus: z.string().trim().max(50).nullable().optional(),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

