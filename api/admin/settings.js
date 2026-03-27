const { handleAdminSettings } = require("../../lib/api-handlers");

module.exports = async (request, response) => {
  await handleAdminSettings(request, response);
};
