const sendAdminMessage = require('./transport')

//Send an out-of-band message
const createOutOfBandInvitation = async () =>
  // ...What variables do I need?
  /*
    use_public_did,
    attachments (array)
    include_handshake
  */

  {
    try {
      console.log('Generate OOB Message:')

      const response = await sendAdminMessage(
        'post',
        '/out-of-band/create-invitation',
        {},
        {
          use_public_did: false,
          include_handshake: true,
        },
      )

      console.log(response)
      return response
    } catch (error) {
      console.error('Error while sending out-of-band message')
      throw error
    }
  }

module.exports = {
  createOutOfBandInvitation,
}
