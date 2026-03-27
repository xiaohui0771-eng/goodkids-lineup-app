const { handleAdminLogin } = require("../../lib/api-handlers");

module.exports = async (request, response) => {
  await handleAdminLogin(request, response);
};
