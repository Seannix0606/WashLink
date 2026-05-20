import { z } from 'zod'

export const CreateBookingInputSchema = z.object({
  customerName: z.string().trim().min(1, 'Customer name is required').max(100),
  vehicleType: z.string().trim().min(1, 'Vehicle type is required').max(100),
  serviceType: z.string().trim().min(1, 'Service type is required').max(100),
  address: z.string().trim().min(1, 'Address is required').max(200),
  time: z.string().trim().min(1, 'Time is required').max(100),
  shopIdentifier: z.string().uuid().nullable(),
  latitude: z.number().nullable().refine(
    (value) => value === null || (value >= -90 && value <= 90),
    { message: 'Latitude must be between -90 and 90' },
  ),
  longitude: z.number().nullable().refine(
    (value) => value === null || (value >= -180 && value <= 180),
    { message: 'Longitude must be between -180 and 180' },
  ),
  customerNotes: z.string().max(500).nullable(),
})

export const CreateShopInputSchema = z.object({
  name: z.string().trim().min(1, 'Shop name is required').max(120),
  address: z.string().trim().min(1, 'Address is required').max(200),
  phoneNumber: z.string().trim().min(1, 'Phone number is required').max(20).nullable(),
  latitude: z.number().nullable().refine(
    (value) => value === null || (value >= -90 && value <= 90),
    { message: 'Latitude must be between -90 and 90' },
  ),
  longitude: z.number().nullable().refine(
    (value) => value === null || (value >= -180 && value <= 180),
    { message: 'Longitude must be between -180 and 180' },
  ),
})

export const UpdateShopInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Shop name is required').max(120).optional(),
    address: z.string().trim().min(1, 'Address is required').max(200).optional(),
    phoneNumber: z.string().trim().min(1, 'Phone number is required').max(20).nullable().optional(),
    latitude: z.number().nullable().refine(
      (value) => value === null || (value >= -90 && value <= 90),
      { message: 'Latitude must be between -90 and 90' },
    ).optional(),
    longitude: z.number().nullable().refine(
      (value) => value === null || (value >= -180 && value <= 180),
      { message: 'Longitude must be between -180 and 180' },
    ).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export const CreateWorkerInputSchema = z.object({
  name: z.string().trim().min(1, 'Worker name is required').max(100),
  phoneNumber: z.string().trim().min(7, 'Phone number is required').max(20),
})
