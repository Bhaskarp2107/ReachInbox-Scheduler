import { redis } from '../config/redis';

function getHourWindow(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');

  return `${year}${month}${day}${hour}`;
}

export async function tryConsumeRateLimit(
  sender: string,
  hourlyLimit: number,
  date = new Date()
): Promise<{
  allowed: boolean;
  count: number;
  key: string;
}> {
  const window = getHourWindow(date);

  const key = `email-rate:${sender}:${window}`;

  /*
   * Lua makes INCR + EXPIRE atomic.
   *
   * This is important when multiple BullMQ workers
   * are processing emails simultaneously.
   */
  const script = `
    local count = redis.call('INCR', KEYS[1])

    if count == 1 then
      redis.call('EXPIRE', KEYS[1], 7200)
    end

    return count
  `;

  const count = Number(
    await redis.eval(
      script,
      1,
      key
    )
  );

  if (count > hourlyLimit) {
    /*
     * We consumed one counter value above the limit.
     *
     * Roll it back so the counter remains accurate.
     */
    await redis.decr(key);

    return {
      allowed: false,
      count: count - 1,
      key,
    };
  }

  return {
    allowed: true,
    count,
    key,
  };
}