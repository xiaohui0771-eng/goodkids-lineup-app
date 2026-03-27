const { handleAdminLogout } = require("../../lib/api-handlers");

module.exports = async (request, response) => {
  await handleAdminLogout(request, response);
};
