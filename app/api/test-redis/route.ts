import { redis } from "@/lib/redis";

export async function GET() {
  await redis.set("test:key", "Redis is working 🚀");

  const value = await redis.get("test:key");

  return Response.json({
    success: true,
    value,
  });
}