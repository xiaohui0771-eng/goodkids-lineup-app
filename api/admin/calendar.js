const { handleAdminCalendar } = require("../../lib/api-handlers");

module.exports = async (request, response) => {
  await handleAdminCalendar(request, response);
};
