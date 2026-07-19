const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

client.connect()
  .then(() => console.log("Connected:", client.db().databaseName))
  .catch(err => console.error("Connection error:", err));

module.exports = client;
