require("dotenv").config();

const mongoose = require("mongoose");
const AttendanceRecord = require("../src/server/models/AttendanceRecord");

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await AttendanceRecord.updateMany(
    {},
    {
      $unset: {
        gpsVerified: "",
        gpsLatitude: "",
        gpsLongitude: "",
        gpsAccuracy: "",
        officeDistanceMeter: "",
        allowedRadiusMeter: "",
        officeVerified: "",
        attendanceSource: "",
        createdAt: "",
        updatedAt: "",
        __v: ""
      },
      $set: { remark: "" }
    }
  );

  console.log(JSON.stringify({ matched: result.matchedCount, modified: result.modifiedCount }));
  await mongoose.disconnect();
}

migrate().catch(async error => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exit(1);
});
