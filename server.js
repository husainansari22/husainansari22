const path = require("path");

process.env.NODE_ENV = "production";

const standaloneDir = path.join(__dirname, ".next");
process.chdir(standaloneDir);

require(path.join(standaloneDir, "server.js"));
