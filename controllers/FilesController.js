import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { ObjectID } from 'mongodb';
import {v4 as uuidv4} from 'uuid';
import fs from 'fs';

class FilesController {
    static async postUpload(req, res) {
        const token = req.header('X-Token');
        const key = `auth_${token}`;
        const userId = await redisClient.get(key);
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { name, type, parentId, isPublic, data } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Missing name' });
            return;
        }
        if (!type || !['folder', 'file', 'image'].includes(type)) {
            res.status(400).json({ error: 'Missing type' });
            return
        }
        if (!data && type !== 'folder') {
            res.status(400).json({ error: 'Missing data' });
            return
        }
        const file = {
            name,
            type,
            userId: userId,
            parentId: parentId || '0',
            isPublic: isPublic || false
        };
        const users = dbClient.db.collection('files');
        const idObject = new ObjectID(parentId)
        if (parentId) {
            await users.findOne({ _id: idObject }, async (err, result) => {
            if (!result) {
                res.status(400).json({ error: 'Parent not found' });
                return
            } else if (result.type !== 'folder') {
                res.status(400).json({ error: 'Parent is not a folder' });
                return
            }
        })
        } else if (type === 'folder') {
            await dbClient.dbcollection('files').insertOne(file)
            res.status(201).json(file)
        } else {
            const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager'
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            const fileName = `${folderPath}/${uuidv4()}`;
            fs.writeFile(filePath, data);
            file.data = filePath;
            await dbClient.db.collection('files').insertOne(file)
            res.status(201).json(file)
        }
    }
}
module.exports = FilesController;