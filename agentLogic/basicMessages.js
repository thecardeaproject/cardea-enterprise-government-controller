const Websockets = require('../websockets.js')

const AdminAPI = require('../adminAPI')

const Presentations = require('./presentations.js')

const sendBasicMessage = async (connectionId, body) => {
  try {
    const response = await AdminAPI.Connections.sendBasicMessage(
      connectionId,
      body,
    )
    return response
  } catch (error) {
    console.error('Error sending basic message:' + error)
    throw error
  }
}

const adminMessage = async (message) => {
  console.log('New Basic Message')

  // Connection Reuse Method
  switch (message.content) {
    case 'patient_registration':
      console.log('Connection Request patient_registration')

      await Websockets.sendMessageToAll('INVITATIONS', 'SINGLE_USE_USED', {
        workflow: message.content,
        connection_id: message.connection_id,
      })

      break
    default:
      console.warn('Regular Basic Message:', message.content)
      return
  }
}

module.exports = {
  adminMessage,
  sendBasicMessage,
}
