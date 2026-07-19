const { Pool } = require("pg");
const mysql = require("mysql2/promise");
const { dbClient } = require("../config");

function createPool() {
  if (dbClient === "mysql") {
    if (!process.env.HOSTINGER_DB_HOST && !process.env.MYSQLHOST) {
      console.warn("HOSTINGER_DB_HOST is not set. API requests will fail until it is configured.");
    }

    return mysql.createPool({
      host: process.env.HOSTINGER_DB_HOST || process.env.MYSQLHOST,
      port: Number(process.env.HOSTINGER_DB_PORT || process.env.MYSQLPORT || 3306),
      user: process.env.HOSTINGER_DB_USER || process.env.MYSQLUSER,
      password: process.env.HOSTINGER_DB_PASSWORD || process.env.MYSQLPASSWORD,
      database: process.env.HOSTINGER_DB_NAME || process.env.MYSQLDATABASE,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10)
    });
  }

  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. API requests will fail until it is configured.");
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });
}

module.exports = {
  pool: createPool()
};
