const mongoose = require("mongoose");

let connectionPromise = null;

function getMongoUri() {
  return process.env.MONGODB_URI || "";
}

async function connectDatabase() {
  const uri = getMongoUri();

  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
    });
  }

  await connectionPromise;
  return mongoose.connection;
}

module.exports = {
  connectDatabase,
  getMongoUri
};
