require("dotenv").config();

const { connectDatabase } = require("../src/server/db/connection");
const Lead = require("../src/server/models/Lead");

async function normalizeLeads() {
  await connectDatabase();
  const result = await Lead.collection.updateMany(
    {},
    { $unset: { priority: "", assignedEmployeeName: "", marketingAssignedTlName: "" } }
  );
  console.log(`Normalized ${result.modifiedCount} of ${result.matchedCount} lead documents.`);
  await Lead.db.close();
}

normalizeLeads().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
