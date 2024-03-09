import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db'
import redisClient from '../utils/redis';


class AuthController {
    static async getConnect(req, res) {
        const auth = req.header('Authorization').split(' ')[1]
        let [email, password] = atob(auth).split(':')
        password = sha1(password)
        const users = dbClient.db.collection('users')
        const user = await users.findOne({ email, password })
        if (!user) {
            res.status(401).json({ error: 'Unauthorized'})
            return
        }
        console.log(typeof user._id)
        const token = uuidv4()
        const key = `auth_${token}`
        await redisClient.set(key, user.id, 86400)
        res.json({ token: token })
    }

    static async getDisconnect(req, res) {
        const token = req.header('X-Token')
        const key = `auth_${token}`
        const userId = await redisClient.get(key)
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized'})
          return
        }
        await redisClient.del(key)
        res.status(204).send()
    }
}

module.exports = AuthController;
