const mongoose = require("mongoose");
const config = require("../config");
const { seedDefaultPlans } = require("./seedPlans");
const { seedDefaultTemplates } = require("./seedTemplates");
const { seedDevAdminOperator } = require("./seedAdminOperator");

let connecting;
let lifecycleHooksRegistered = false;

/** Hide password in logged URIs (mongodb://user:pass@host → mongodb://user:***@host). */
function redactMongoUri(uri) {
  return String(uri || "").replace(/\/\/([^:/?]+):([^@]+)@/g, "//$1:***@");
}

function registerLifecycleHooksOnce() {
  if (lifecycleHooksRegistered) return;
  lifecycleHooksRegistered = true;

  mongoose.connection.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[MongoDB] connection error:", err.message);
  });
  mongoose.connection.on("disconnected", () => {
    // eslint-disable-next-line no-console
    console.warn("[MongoDB] disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    // eslint-disable-next-line no-console
    console.log("[MongoDB] reconnected");
  });
}

async function connectDb() {
  registerLifecycleHooksOnce();

  if (mongoose.connection.readyState === 1) return;
  if (connecting) {
    await connecting;
    return;
  }
  connecting = mongoose.connect(config.mongoUri);
  await connecting;
  connecting = null;

  // eslint-disable-next-line no-console
  console.log(`[MongoDB] connected (${redactMongoUri(config.mongoUri)})`);

  try {
    await seedDefaultPlans();
    await seedDefaultTemplates();
    await seedDevAdminOperator();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[MongoDB] seed failed:", e.message);
    throw e;
  }
}

/** Mongoose readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting */
function getMongoConnectionLabel() {
  const labels = ["disconnected", "connected", "connecting", "disconnecting"];
  return labels[mongoose.connection.readyState] ?? "unknown";
}

module.exports = { connectDb, mongoose, getMongoConnectionLabel };
