import { ObjectID } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import mime from 'mime-types';
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
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const user = await redisClient.get(key);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { parentId, page = 0 } = req.query;
    const files = dbClient.db.collection('files');
    let query;
    if (!parentId) {
      query = { userId: ObjectID(user) };
      // query = { userId: user };
    } else {
      query = { parentId: ObjectID(parentId), userId: ObjectID(user) };
    }
    console.log(query);
    const result = await files.aggregate([
      { $match: query },
      { $skip: parseInt(page, 10) * 20 },
      { $limit: 20 },
    ]).toArray();
    const newArr = result.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
    res.status(200).json(newArr);
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
    const objectId2 = new ObjectID(userId);
    const file = await files.findOne({ _id: objectId, userId: objectId2 });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(file);
  }

  static async putPublish(req, res) {
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
    const objectId2 = new ObjectID(userId);
    const file = await files.findOne({ _id: objectId, userId: objectId2 });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    file.isPublic = true;
    res.json(file);
  }

  static async putUnpublish(req, res) {
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
    const objectId2 = new ObjectID(userId);
    const file = await files.findOne({ _id: objectId, userId: objectId2 });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    file.isPublic = false;
    res.json(file);
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const objectId = new ObjectID(id);
    const file = await files.findOne({ _id: objectId });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!file.isPublic && (!userId || file.userId.toString() !== userId)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (file.type === 'folder') {
      res.status(400).json({ error: "A folder doesn't have content" });
      return;
    }

    fs.stat(file.localPath, (err) => {
      if (err) {
        res.status(404).json({ error: 'Not found' });
      }
    });

    const mimeType = mime.lookup(file.name);
    res.setHeader('Content-Type', mimeType);
    const fileData = (await fs.promises.readFile(file.localPath));
    res.status(200).send(fileData);
  }
}
module.exports = FilesController;
