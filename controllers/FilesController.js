import { ObjectID } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
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
    const files = dbClient.db.collection('files');
    if (parentId) {
      const idObject = new ObjectID(parentId);
      const parentFolder = await files.findOne({ _id: idObject });
      if (!parentFolder) {
        res.status(400).json({ error: 'Parent not found' });
      } if (parentFolder.type !== 'folder') {
        res.status(400).json({ error: 'Parent is not a folder' });
      }
    }
    if (type === 'folder') {
      await files.insertOne(file);
      res.status(201).json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      });
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      await fs.mkdir(folderPath);
    }
    const filePath = `${folderPath}/${uuidv4()}`;
    fs.writeFile(filePath, Buffer.from(data, 'base64'), async (err) => {
      if (!err) {
        file.localPath = filePath;
        await files.insertOne(file);
        res.status(201).json({
          id: file._id,
          userId: file.userId,
          name: file.name,
          type: file.type,
          isPublic: file.isPublic,
          parentId: file.parentId,
        });
      }
    });
  }
}
module.exports = FilesController;
