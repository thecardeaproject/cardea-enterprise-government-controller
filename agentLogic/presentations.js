const {v4: uuid} = require('uuid')

const ControllerError = require('../errors.js')

const AdminAPI = require('../adminAPI')
const Websockets = require('../websockets.js')
const Credentials = require('./credentials.js')

const requestPresentation = async (connectionID) => {
  console.log(`Requesting Presentation from Connection: ${connectionID}`)

  const result = AdminAPI.Presentations.requestPresentation(
    connectionID,
    [
      'patient_first_name',
      'patient_last_name',
      'patient_date_of_birth',
      'result',
      'observation_date_time',
    ],
    'X2JpGAqC7ZFY4hwKG6kLw9:2:Covid_19_Lab_Result:1.5',
    'Requesting Presentation',
    false,
  )

  return result
}

const adminMessage = async (message) => {
  console.log('Received Presentations Message', message)

  if (message.state === 'verified') {
    let values = ''

    // (mikekebert) Check the data format to see if the presentation requires the referrant pattern
    if (message.presentation.requested_proof.revealed_attr_groups) {
      values =
        message.presentation.requested_proof.revealed_attr_groups[
          '0_patient_first_name_uuid'
        ].values // TODO: this needs to be a for-in loop or similar later
    } else {
      values = message.presentation.requested_proof.revealed_attrs
    }

    if (
      values.result.raw === 'Negative' ||
      values.result.raw === 'Weakly positive'
    ) {
      trusted_date_time = new Date()
      const attributes = [
        {
          name: 'trusted_traveler_id',
          value: uuid(),
        },
        {
          name: 'traveler_first_name',
          value: values.patient_first_name.raw,
        },
        {
          name: 'traveler_last_name',
          value: values.patient_last_name.raw,
        },
        {
          name: 'traveler_date_of_birth',
          value: values.patient_date_of_birth.raw,
        },
        {
          name: 'trusted_date_time',
          value: trusted_date_time.toLocaleString(),
        },
      ]

      let newCredential = {
        connectionID: message.connection_id,
        schemaID: 'X2JpGAqC7ZFY4hwKG6kLw9:2:Trusted_Traveler:1.0',
        schemaVersion: '1.0',
        schemaName: 'Trusted_Traveler',
        schemaIssuerDID: 'X2JpGAqC7ZFY4hwKG6kLw9',
        comment: '',
        attributes: attributes,
      }

      // (mikekebert) Request issuance of the trusted_traveler credential
      await Credentials.autoIssueCredential(
        newCredential.connectionID,
        undefined,
        undefined,
        newCredential.schemaID,
        newCredential.schemaVersion,
        newCredential.schemaName,
        newCredential.schemaIssuerDID,
        newCredential.comment,
        newCredential.attributes,
      )
    } else {
      // (mikekebert) Send a basic message saying the verification was rejected because of business logic
      console.log('Presentation rejected: 2019-nCoV Detected')
      await AdminAPI.Connections.sendBasicMessage(message.connection_id, {
        content: 'INVALID_PROOF',
      })
    }
  } else if (message.state === null) {
    // (mikekebert) Send a basic message saying the verification failed for technical reasons
    console.log('Validation failed for technical reasons')
    await AdminAPI.Connections.sendBasicMessage(message.connection_id, {
      content: 'UNVERIFIED',
    })
  } else {}
}

module.exports = {
  adminMessage,
  requestPresentation,
}
