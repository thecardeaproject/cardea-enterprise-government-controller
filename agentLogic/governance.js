const axios = require('axios')
const DIDs = require('../adminAPI/dids.js')

// (eldersonar) Set up the ssl check flag for testing if SSL cert is expired during live test
// If not set, this code will use default settings for axios calls
const https = require('https')
let agent = new https.Agent({
  rejectUnauthorized: true,
})
console.log('SSL check is enabled')

if (process.env.DISABLE_SSL_CHECK === 'true') {
  agent = new https.Agent({
    rejectUnauthorized: false,
  })
  console.log('SSL check is disabled')
}

// Get the machine readable governance file from the external source
const getGovernance = async () => {
  try {
    const response = await axios({
      method: 'GET',
      // url: 'http://localhost:3100/api/governance-framework',
      url: `${process.env.GOVERNANCE_PATH}`,
      httpsAgent: agent,
      // url: 'https://government.black.indiciotech.io/api/governance-framework'
    }).then((res) => {
      console.log('......................................')
    //   console.log(res.data)
      return res.data
    })
    return response
  } catch (error) {
    console.error('Governance Document Request Error')
    console.log(error)

    // (eldersonar) Doesn't always have a response. Do we handle specific codes or handle all errors as one?
    // if (error.response.status) return undefined
    // (eldersonar) This will ensure that we set our response to undefined
    if (error) return undefined
  }
}

// (eldersonar) Get Presentation Definition file
const getPresentationDefinition = async () => {
  try {
    const governance = await getGovernance()

    // Presentation definition file
    const pdfLink = governance.actions.find(
      (item) => item.name === 'issue_trusted_traveler',
    ).details.presentation_definition

    const response = await axios({
      method: 'GET',
      url: pdfLink,
      httpsAgent: agent,
    }).then((res) => {
      return res.data
    })

    return response
  } catch (error) {
    console.error('Presentation Definition File Request Error')
    // console.log(error.response.status)
    console.log(error)

    // (eldersonar) Do we handle specific codes or handle all errors as one?
    // if (error.response.status)
    return undefined

    // throw error
  }
}

//------------ (eldersonar) TODO: remove after trial-------------
const getLabPresentationDefinition = async () => {
  try {
    const governance = await getGovernance()

    // Presentation definition file
    const pdfLink = 'http://localhost:3100/api/lab-presentation-exchange'

    const response = await axios({
      method: 'GET',
      url: pdfLink,
      httpsAgent: agent,
    }).then((res) => {
      return res.data
    })

    return response
  } catch (error) {
    console.error('Presentation Definition File Request Error')
    // console.log(error.response.status)
    console.log(error)

    // (eldersonar) Do we handle specific codes or handle all errors as one?
    // if (error.response.status)
    return undefined

    // throw error
  }
}

const getLabVaccinePresentationDefinition = async () => {
  try {
    const governance = await getGovernance()

    // Presentation definition file
    const pdfLink =
      'http://localhost:3100/api/lab-vaccine-presentation-exchange'

    const response = await axios({
      method: 'GET',
      url: pdfLink,
      httpsAgent: agent,
    }).then((res) => {
      return res.data
    })

    return response
  } catch (error) {
    console.error('Presentation Definition File Request Error')
    // console.log(error.response.status)
    console.log(error)

    // (eldersonar) Do we handle specific codes or handle all errors as one?
    // if (error.response.status)
    return undefined

    // throw error
  }
}
//------------ (eldersonar) TODO: remove after trial-------------

// Get DID
const getDID = async () => {
  try {
    // Validate Public DID
    const publicDID = await DIDs.fetchPublicDID()

    if (!publicDID) {
      console.error('Public DID Not Set')
      return null
    }

    return publicDID.did
  } catch (error) {
    console.error('Error finding public did')
    throw error
  }
}

// Validate participant
const validateParticipant = async (schemaID, protocol, endorserDID) => {
  try {
    const governance = await getGovernance()
    const permissions = governance.permissions

    if (!governance || Object.keys(governance).length === 0) {
      console.log("Governance file is empty or doesn't exist")
      return {error: 'noGov'}
    } else if (!governance.hasOwnProperty('permissions')) {
      // (eldersonar) TODO: rename the return value
      console.log('the file is not empty, but lacks core data')
      return {error: 'limitedGov'}
    } else {
      // (eldersonar) Preparing for presentation definition schemas extraction in future
      const schemas = [
        'RuuJwd3JMffNwZ43DcJKN1:2:Vaccination:1.4',
        'RuuJwd3JMffNwZ43DcJKN1:2:Exemption:1.4',
        'RuuJwd3JMffNwZ43DcJKN1:2:Lab_Result:1.4',
      ]
      const schemaMatch = schemas
        .filter((schema) => schema === schemaID)
        .toString()

      let rule = governance.command_drive.find(
        (o) => o.data.schema === schemaMatch && o.data.protocol === protocol,
      )
      let role = null
      let permission = null

      if (rule) {
        role = rule.role.toString()

        // Validate participant by DID and role
        for (i = 0; i < permissions.length; i++) {
          if (
            permissions[i].when.any.find((item) => item.id === endorserDID) &&
            permissions[i].grant[0] === role
          ) {
            permission = true
          }
        }
        // Rule was not found
      } else {
        console.log('FAILED no role')
        return false
      }

      return permission
    }
  } catch (error) {
    console.error('Error fetching participant')
    throw error
  }
}

// Get permissions
const getPermissionsByDID = async () => {
  try {
    const did = await getDID()
    const governance = await getGovernance()
    let permissions = []

    for (i = 0; i < governance.permissions.length; i++) {
      if (governance.permissions[i].when.any.find((item) => item.id === did)) {
        permissions.push(governance.permissions[i].grant[0])
      }
    }

    return permissions
  } catch (error) {
    console.error('Error fetching permissions')
    throw error
  }
}

// Get privileges by roles
const getPrivilegesByRoles = async () => {
  try {
    const did = await getDID()

    if (!did) return {error: 'noDID'}
    else {
      const governance = await getGovernance()

      // (eldersonar) missing or empty governance
      if (!governance || Object.keys(governance).length === 0) {
        console.log("the file is empty or doesn't exist")
        return {error: 'noGov'}
        // (eldersonar) partial governance
      } else if (
        // !governance.hasOwnProperty('participants') ||
        !governance.hasOwnProperty('roles') ||
        !governance.hasOwnProperty('permissions') ||
        // !governance.hasOwnProperty('actions') ||
        !governance.hasOwnProperty('privileges')
      ) {
        console.log('the file is not empty, but lacks core data')
        // return { error: "limitedGov" }
        return {error: 'noPrivileges'}
        // (eldersonar) You have a pass
      } else {
        const permissions = await getPermissionsByDID()

        if (!permissions || permissions.length == 0)
          // return { error: 'noPermissions' }
          return {error: 'noPrivileges'}
        else {
          let privileges = []

          // (eldersonar) Get a list of privileges by roles
          for (let i = 0; i < permissions.length; i++) {
            for (j = 0; j < governance.privileges.length; j++) {
              if (
                governance.privileges[j].when.any.find(
                  (item) => item.role === permissions[i],
                )
              ) {
                privileges.push(governance.privileges[j].grant[0])
              }
            }
          }

          if (!privileges || privileges.length == 0)
            return {error: 'noPrivileges'}
          else {
            const uniquePrivileges = [...new Set(privileges)]

            return uniquePrivileges
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching privileges')
    throw error
  }
}

// Get actions by privileges
const getActionsByPrivileges = async () => {
  try {
    const did = await getDID()

    if (!did) return {error: 'noDID'}
    else {
      const governance = await getGovernance()

      // (eldersonar) missing or empty governance
      if (!governance || Object.keys(governance).length === 0) {
        console.log("the file is empty or doesn't exist")
        return {error: 'noGov'}
        // (eldersonar) partial governance
      } else if (
        // !governance.hasOwnProperty('participants') ||
        !governance.hasOwnProperty('roles') ||
        !governance.hasOwnProperty('permissions') ||
        !governance.hasOwnProperty('actions') ||
        !governance.hasOwnProperty('privileges')
      ) {
        console.log('the file is not empty, but lacks core data')
        // return { error: "limitedGov" }
        return {error: 'noPrivileges'}
        // (eldersonar) Pass granted
      } else {
        const privileges = await getPrivilegesByRoles()
        const actionsArr = await getActions()

        if (!privileges || privileges.length == 0) {
          return {error: 'noPrivileges'}
        } else if (!actionsArr || actionsArr.length == 0) {
          return {error: 'noActionsArr'}
        } else {
          let actions = []

          // Get a list of actions by privileges
          for (let i = 0; i < privileges.length; i++) {
            for (j = 0; j < actionsArr.length; j++) {
              if (actionsArr[j].name === privileges[i]) {
                actions.push(actionsArr[j])
              }
            }
          }

          // (eldersonar) Filter unique actions
          if (!actions || actions.length == 0) return {error: 'noActions'}
          else {
            const uniqueActions = [...new Set(actions)]

            return uniqueActions
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching actions by privileges')
    throw error
  }
}

// Get actions
const getActions = async () => {
  try {
    const did = await getDID()
    if (!did) return {error: 'noDID'}
    else {
      const governance = await getGovernance()

      if (!governance || Object.keys(governance).length === 0) {
        console.log("the file is empty or doesn't exist")
        return {error: 'noGov'}
      } else if (!governance.hasOwnProperty('actions')) {
        console.log('the are no actions')
        return {error: 'noActions'}
      } else {
        return governance.actions
      }
    }
  } catch (error) {
    console.error('Error fetching actions')
    throw error
  }
}

// Get participants
const getParticipants = async () => {
  try {
    const did = await getDID()
    if (!did) return {error: 'noDID'}
    else {
      const governance = await getGovernance()

      if (!governance || Object.keys(governance).length === 0) {
        console.log("the file is empty or doesn't exist")
        return {error: 'noGov'}
      } else if (!governance.hasOwnProperty('participants')) {
        console.log('the are no participants')
        return {error: 'noParticipants'}
      } else {
        return governance.participants
      }
    }
  } catch (error) {
    console.error('Error fetching participants')
    throw error
  }
}

module.exports = {
  getGovernance,
  getPresentationDefinition,
  validateParticipant,
  getPermissionsByDID,
  getPrivilegesByRoles,
  getParticipants,
  getActionsByPrivileges,
  getActions,
}