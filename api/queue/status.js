const { handleQueueStatus } = require("../../lib/api-handlers");

module.exports = async (request, response) => {
  await handleQueueStatus(request, response);
};
