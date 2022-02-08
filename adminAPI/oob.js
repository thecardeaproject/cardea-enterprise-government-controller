const sendAdminMessage = require('./transport')

//Send an out-of-band message
const createOutOfBandInvitation = async () => {
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

    return response
  } catch (error) {
    console.error('Error while sending out-of-band message')
    throw error
  }
}

module.exports = {
  createOutOfBandInvitation,
}
