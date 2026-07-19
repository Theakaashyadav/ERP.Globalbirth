const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
let client = null;

if (!uri) {
  console.error("Connection error: MONGODB_URI is not set.");
} else {
  client = new MongoClient(uri);

  client.connect()
    .then(() => console.log("Connected:", client.db().databaseName))
    .catch(err => console.error("Connection error:", err));
}

module.exports = client;
