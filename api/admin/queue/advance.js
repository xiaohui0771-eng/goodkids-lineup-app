const { handleAdminAdvance } = require("../../../lib/api-handlers");

module.exports = async (request, response) => {
  await handleAdminAdvance(request, response);
};
