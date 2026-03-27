const { handleAdminDashboard } = require("../../lib/api-handlers");

module.exports = async (request, response) => {
  await handleAdminDashboard(request, response);
};
