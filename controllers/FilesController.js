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
    // const parentId = ObjectID(pId)
    // console.log(req.query)
    // const parentId = parseInt(req.query.parentId, 10) ? ObjectID(req.query.parentId) : '0';
    // const page = req.query.page || 0;
    const files = dbClient.db.collection('files');
    let query;
    if (!parentId) {
    // console.log("Constructing query for parentId = '0'");
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
    const newArr = result.map(({ _id, localPath, ...rest }) => ({ id: _id, ...rest }));
    // console.log(newArr[0])
    // delete newArr.localPath;
    // console.log(newArr[1])
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

    if (!userId || (!file.isPublic && file.userId !== userId)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (file.type === 'folder') {
      res.status(404).json({ error: "A folder doesn't have content" });
      return;
    }

    // const exist = await fs.promises.exists(file.localPath)
    // await fs.promises.exists(file.localPath, (exists) => {
    //   return res.status(404).json({error: 'Not found'});
    // });
    const size = req.query.size || null;
    // let filePath = file.localPath;
    // if (size) {
    //   filePath = `${file.localPath}_${size}`;
    // }
    // console.log(filePath)
    // if (!fs.existsSync(filePath)) {
    //   // console.log("exts, call back")
    //   res.status(404).json({ error: 'Not found' });
    //   return;
    // }
    // // console.log("it should've stoped")

    // const mimeType = mime.lookup(file.name);
    // console.log(mimeType);
    // res.setHeader('Content-Type', mimeType);
    // const fileData = await fs.promises.readFile(file.localPath);
    // console.log(file.localPath)
    // console.log(fileData);
    // res.send(fileData);
    let filePath = file.localPath;
    if (size) {
      filePath = `${file.localPath}_${size}`;
    }
    if (fs.existsSync(filePath)) {
      const fileInfo = await fs.statAsync(filePath);
      if (!fileInfo.isFile()) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    } else {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const absoluteFilePath = await fs.realpathAsync(filePath);
    res.setHeader('Content-Type', mime.contentType(file.name) || 'text/plain; charset=utf-8');
    res.status(200).sendFile(absoluteFilePath);
  }
}
module.exports = FilesController;
