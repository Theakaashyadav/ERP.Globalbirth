const mysqlSchema = require("fs").readFileSync(require("path").join(__dirname, "../../../database/schema.mysql.sql"), "utf8");
const postgresSchema = require("fs").readFileSync(require("path").join(__dirname, "../../../database/schema.sql"), "utf8");

module.exports = {
  mysqlSchema,
  postgresSchema
};
