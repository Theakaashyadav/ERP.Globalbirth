const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.warn("MONGODB_URI is not set. MongoDB client cannot connect yet.");
}

const client = new MongoClient(uri || "mongodb://127.0.0.1:27017/attendance_system");

async function connectMongoClient() {
  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  await client.connect();
  console.log("Connected:", client.db().databaseName);
  return client;
}

module.exports = {
  client,
  connectMongoClient
};
