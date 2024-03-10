import { ObjectID } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import fs from 'fs';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const {
      name, type, parentId, isPublic, data,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!data && type !== 'folder') {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    const file = {
      name,
      type,
      userId,
      parentId: parentId || '0',
      isPublic: isPublic || false,
    };
    if (parentId) {
      const files = dbClient.db.collection('files');
      const idObject = new ObjectID(parentId);
      await files.findOne({ _id: idObject }, async (err, result) => {
        if (!result) {
          return res.status(400).json({ error: 'Parent not found' });
        } if (result.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
        return true;
      });
    } else if (type === 'folder') {
      await dbClient.db.collection('files').insertOne(file);
      res.status(201).json(file);
    } else {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) {
        promisify(fs.mkdir(folderPath));
      }
      const filePath = `${folderPath}/${uuidv4()}`;
      await promisify(fs.writeFile(filePath, Buffer.from(data, 'base64')));
      file.localPath = filePath;
      await dbClient.db.collection('files').insertOne(file);
      res.status(201).json(file);
    }
  }
}
module.exports = FilesController;
