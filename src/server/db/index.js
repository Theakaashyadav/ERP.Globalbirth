const { dbClient } = require("../config");
const { pool } = require("./pool");

function toMysqlSql(sql) {
  return sql.replace(/\$[0-9]+/g, "?");
}

async function query(sql, params = []) {
  if (dbClient === "mysql") {
    const [rows] = await pool.execute(toMysqlSql(sql), params);

    return {
      rows: Array.isArray(rows) ? rows : [],
      rowCount: rows && typeof rows.affectedRows === "number" ? rows.affectedRows : 0
    };
  }

  return pool.query(sql, params);
}

module.exports = {
  query,
  dbClient
};
