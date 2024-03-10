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
    const { name } = req.body;
    const { type } = req.body;
    const { parentId } = req.body;
    const isPublic = req.body.isPublic || false;
    const { data } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!data && type !== 'folder') {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    const files = dbClient.db.collection('files');
    if (parentId) {
      const idObject = new ObjectID(parentId);
      const parentFolder = await files.findOne({ _id: idObject });
      if (!parentFolder) {
        res.status(400).json({ error: 'Parent not found' });
        return;
      } if (parentFolder.type !== 'folder') {
        res.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    }
    if (type === 'folder') {
      await files.insertOne({
        userId,
        name,
        type,
        parentId: parentId || 0,
        isPublic,
      }).then((result) => {
        res.status(201).json({
          id: result.insertedId,
          userId,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
        })
      })      
      return;
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      await fs.mkdir(folderPath);
    }
    const filePath = `${folderPath}/${uuidv4()}`;
    fs.writeFile(filePath, Buffer.from(data, 'base64'), 'utf-8', async (err) => {
      if (!err) {
        await files.insertOne({
          userId,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
          localPath: filePath,
        }).then((result) => {
          res.status(201).json({
            id: result.insertedId,
            userId,
            name,
            type,
            isPublic,
            parentId: parentId || 0,
          });
        })
      }
    });
  }
}
module.exports = FilesController;
