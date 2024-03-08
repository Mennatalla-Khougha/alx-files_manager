import { promisify } from 'util';
import { createClient } from 'redis';

class RedisClient {
  constructor() {
    this.client = createClient();
    this.client.on('error', (err) => console.log(err));
    this.Del = promisify(this.client.del).bind(this.client);
  }
  
  isAlive() {
    const res = this.client.on('ready', () => true);
    return !!res;
  }
  
  async get(key) {
    this.Get = promisify(this.client.get).bind(this.client);
    return this.Get(key).then((value) => value);
  }

  async set(key, value, duration) {
    const SetExp = promisify(this.client.set).bind(this.client);
    await SetExp(key, value);
    await this.client.expire(key, duration);
  }

  async del(key) {
    this.Del(key);
  }
}
const redisClient = new RedisClient();

module.exports = redisClient;
// export default RedisClient
