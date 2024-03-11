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
    console.log(req.body);
    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

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

    const file = {
      name,
      type,
      userId,
      parentId,
      isPublic,
    };
    const files = dbClient.db.collection('files');

    if (parentId) {
      const idObject = ObjectID(parentId);
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
      const result = await files.insertOne(file);
      const [{
        name, _id, isPublic, userId, type, parentId,
      }] = result.ops;
      res.status(201).json({
        id: _id.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
      return;
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.promises.mkdir(folderPath, { recursive: true });
    const filePath = `${folderPath}/${uuidv4()}`;
    await fs.promises.writeFile(filePath, Buffer.from(data, 'base64'));
    file.localPath = filePath;
    if (type !== 'folder') {
      const result = await files.insertOne(file);
      const [{
        name, _id, isPublic, userId, type, parentId,
      }] = result.ops;
      res.status(201).json({
        id: _id.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
    }
    // , 'utf-8', async (err) => {
    //   if (!err) {
    //     const result = await files.insertOne({
    //       userId,
    //       name,
    //       type,
    //       isPublic,
    //       parentId: parentId || 0,
    //       localPath: filePath,
    //     });
    //     res.status(201).json({
    //       id: result.insertedId,
    //       userId,
    //       name,
    //       type,
    //       isPublic,
    //       parentId: parentId || 0,
    //     });
    //   }
    // }
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { parentId = 0, page = 0 } = req.query;
    const files = dbClient.db.collection('files');
    const result = await files.aggregate([
      { $match: { userId, parentId: new ObjectID(parentId) } },
      { $skip: page * 20 },
      { $limit: 20 },
    ]).toArray();
    res.status(200).json(result);
  }

  static async getShow(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const objectId = new ObjectID(id);
    const file = await files.findOne({ _id: objectId, userId: userId._id });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(file);
  }
}
module.exports = FilesController;
