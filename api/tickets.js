const { handleCreateTicket } = require("../lib/api-handlers");

module.exports = async (request, response) => {
  await handleCreateTicket(request, response);
};
