const Websockets = require('../websockets.js')

let ContactsCompiled = require('../orm/contactsCompiled.js')
let Demographics = require('../orm/demographics.js')

const updateOrCreateDemographic = async function (
  contact_id,
  email,
  phone,
  street_address,
  city,
  state_province_region,
  postal_code,
  country
) {
  try {
    await Demographics.createOrUpdateDemographic(
      contact_id,
      email,
      phone,
      street_address,
      city,
      state_province_region,
      postal_code,
      country
    )

    const contact = await ContactsCompiled.readContact(contact_id, [
      'Demographic',
      'Passport',
    ])

    Websockets.sendMessageToAll('CONTACTS', 'CONTACTS', {contacts: [contact]})
  } catch (error) {
    console.error('Error Fetching Contacts')
    throw error
  }
}

module.exports = {
  updateOrCreateDemographic,
}
