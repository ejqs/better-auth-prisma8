export class Prisma8AdapterError extends Error {
  override name = "Prisma8AdapterError";
}

export class Prisma8AdapterCapabilityError extends Prisma8AdapterError {
  override name = "Prisma8AdapterCapabilityError";
}
