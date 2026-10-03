// Flow Arena rooms: one Durable Object per room code (see src/arena.ts).
interface __BaseEnv_Env {
  ARENA_ROOM: DurableObjectNamespace<import("./arena").ArenaRoom>;
}
