const {DateTime} = require('luxon')
const {v4: uuid} = require('uuid')

const ControllerError = require('../errors')

const AdminAPI = require('../adminAPI')
const Websockets = require('../websockets')
const Contacts = require('./contacts')
const Credentials = require('./credentials')
const Governance = require('./governance')
const Passports = require('./passports')
const Demographics = require('./demographics')

const Presentations = require('../orm/presentations')

const {getOrganization} = require('./settings')

const Util = require('../util')

// (eldersonar) Request identity proof
const requestIdentityPresentation = async (connectionID) => {
  console.log(`Requesting Presentation from Connection: ${connectionID}`)

  const result = AdminAPI.Presentations.requestProof(
    connectionID,
    // (eldersonar) Add remaining fields when the holder is fixed.
    [
      'email',
      'phone',
      'street_address',
      'city',
      'state_province_region',
      'postalcode',
      'country',
      'passport_number',
      'surname',
      'given_names',
      'sex',
      'date_of_birth',
      'place_of_birth',
      'nationality',
      'date_of_issue',
      'date_of_expiration',
      'type',
      'issuing_country',
      'authority',
    ],
  )
  return result
}

// (Eldersonar) This function takes an array of arrays and returns the cartesian product
// (Eldersonar) Spread (...args) if want to send multiple arrays instead of array of arrays
function cartesian(args) {
  let result = [],
    max = args.length - 1

  // Recursive helper function
  function helper(arr, i) {
    for (let j = 0, l = args[i].length; j < l; j++) {
      let a = arr.slice(0) // clone arr
      a.push(args[i][j])
      if (i == max) {
        result.push(a)
      } else helper(a, i + 1)
    }
  }
  helper([], 0)
  return result
}

// (eldersonar) Complex input descriptors handler (one or multiple in-field conditions)
const handleCartesianProductSet = async (
  descriptor,
  cartesianSet,
  connectionID,
) => {
  try {
    const date = Math.floor(Date.now() / 1000)
    const schema_id = descriptor.schema[0].uri
    const name = descriptor.name
    const comment = `Requesting Presentation for ${descriptor.name}`

    // (eldersonar) For each cartesian product of sets
    for (let i = 0; i < cartesianSet.length; i++) {
      let attributes = {}
      let predicates = {}

      // Cartesian product descriptor handler loop
      for (let j = 0; j < cartesianSet[i].length; j++) {
        const dependentPath = cartesianSet[i][j].dependent_fields[0].path
          .join('')
          .split('$.')[1] // (eldersonar) will be not valid if have more than 1 path in the array

        // (eldersonar) Push descriptors into array from cartesion set (in-field dependent fields)
        if (cartesianSet[i][j].dependent_fields[0].filter.exclusiveMinimum) {
          if (
            cartesianSet[i][
              j
            ].dependent_fields[0].filter.exclusiveMinimum.includes('today:')
          ) {
            predicates[dependentPath] = {
              p_type: '>',
              p_value:
                date -
                cartesianSet[i][
                  j
                ].dependent_fields[0].filter.exclusiveMinimum.split(':')[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '>',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (cartesianSet[i][j].dependent_fields[0].filter.minimum) {
          if (
            cartesianSet[i][j].dependent_fields[0].filter.minimum.includes(
              'today:',
            )
          ) {
            predicates[dependentPath] = {
              p_type: '>=',
              p_value:
                date -
                cartesianSet[i][j].dependent_fields[0].filter.minimum.split(
                  ':',
                )[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '>=',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (
          cartesianSet[i][j].dependent_fields[0].filter.exclusiveMaximum
        ) {
          if (
            cartesianSet[i][
              j
            ].dependent_fields[0].filter.exclusiveMaximum.includes('today:')
          ) {
            predicates[dependentPath] = {
              p_type: '<',
              p_value:
                date -
                cartesianSet[i][
                  j
                ].dependent_fields[0].filter.exclusiveMaximum.split(':')[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '<',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (cartesianSet[i][j].dependent_fields[0].filter.maximum) {
          if (
            cartesianSet[i][j].dependent_fields[0].filter.maximum.includes(
              'today:',
            )
          ) {
            predicates[dependentPath] = {
              p_type: '<=',
              p_value:
                date -
                cartesianSet[i][j].dependent_fields[0].filter.maximum.split(
                  ':',
                )[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '<=',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        }
      }

      // (eldersonar) Regular descriptors handler loop
      for (let k = 0; k < descriptor.constraints.fields.length; k++) {
        const path = descriptor.constraints.fields[k].path
          .join('')
          .split('$.')[1] // (eldersonar) will be not valid if have more than 1 path in the array

        // (eldersonar) Push regular descriptors into array
        if (descriptor.constraints.fields[k].filter.exclusiveMinimum) {
          if (
            descriptor.constraints.fields[k].filter.exclusiveMinimum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '>',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.exclusiveMinimum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptor.constraints.fields[k].filter.minimum) {
          if (
            descriptor.constraints.fields[k].filter.minimum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '>=',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.minimum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptor.constraints.fields[k].filter.exclusiveMaximum) {
          if (
            descriptor.constraints.fields[k].filter.exclusiveMaximum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '<',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.exclusiveMaximum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptor.constraints.fields[k].filter.maximum) {
          if (
            descriptor.constraints.fields[k].filter.maximum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '<=',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.maximum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
          // (eldersonar) Assemble the list of attributes
        } else {
          // attributes.push(path)

          attributes[path] = {
            name: path,
            restrictions: [{schema_id}],
          }
        }
      }

      // (eldersonar) Send presentation request
      await AdminAPI.Presentations.requestPresentation(
        connectionID,
        predicates,
        attributes,
        name,
        comment,
        false,
      )
    }
  } catch (error) {
    console.log(error)
  }
}

// (eldersonar) Simple input descriptors handler (no in-field conditions)
const handleSimpleDescriptors = async (descriptors, connectionID) => {
  try {
    for (let i = 0; i < descriptors.length; i++) {
      let attributes = {}
      let predicates = {}

      const schema_id = descriptors[i].schema[0].uri
      const name = descriptors[i].name
      const comment = `Requesting Presentation for ${descriptors[i].name}`
      const date = Math.floor(Date.now() / 1000)

      for (let j = 0; j < descriptors[i].constraints.fields.length; j++) {
        const path = descriptors[i].constraints.fields[j].path
          .join('')
          .split('$.')[1] // (eldersonar) TODO: turn into a loop. This ill be not valid if have more than 1 path in the array

        // Push descriptors into array
        if (descriptors[i].constraints.fields[j].filter.exclusiveMinimum) {
          if (
            descriptors[i].constraints.fields[
              j
            ].filter.exclusiveMinimum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '>',
              p_value:
                date -
                descriptors[i].constraints.fields[
                  j
                ].filter.exclusiveMinimum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptors[i].constraints.fields[j].filter.minimum) {
          if (
            descriptors[i].constraints.fields[j].filter.minimum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '>=',
              p_value:
                date -
                descriptors[i].constraints.fields[j].filter.minimum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (
          descriptors[i].constraints.fields[j].filter.exclusiveMaximum
        ) {
          if (
            descriptors[i].constraints.fields[
              j
            ].filter.exclusiveMaximum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '<',
              p_value:
                date -
                descriptors[i].constraints.fields[
                  j
                ].filter.exclusiveMaximum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptors[i].constraints.fields[j].filter.maximum) {
          if (
            descriptors[i].constraints.fields[j].filter.maximum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '<=',
              p_value:
                date -
                descriptors[i].constraints.fields[j].filter.maximum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else {
          attributes[path] = {
            name: path,
            restrictions: [{schema_id}],
          }
        }
      }

      // (eldersonar) Send presentation request
      await AdminAPI.Presentations.requestPresentation(
        connectionID,
        predicates,
        attributes,
        name,
        comment,
        false,
      )

      // (eldersonar) Clear variables at the end of each iteration
      attributes = {}
      predicates = {}
    }
  } catch (error) {
    console.log(error)
  }
}

// Governance presentation request
const requestPresentation = async (connectionID, type) => {
  console.log(`Requesting Presentation from Connection: ${connectionID}`)

  // (eldersonar) Get governance file and presentation exchange file
  const pdf = await Governance.getPresentationDefinition()

  const inputDescriptors = pdf.presentation_definition.input_descriptors

  try {
    // (eldersonar) Check if we have submission requirments
    if (pdf.presentation_definition.submission_requirements) {
      if (
        !pdf.presentation_definition.submission_requirements[0].hasOwnProperty(
          'from_nested',
        )
      ) {
        // Loop through the input descriptors
        let i = inputDescriptors.length

        // (Eldersonar) Loop through all input descriptors
        while (i--) {
          // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
          if (
            inputDescriptors[i].group.includes(
              pdf.presentation_definition.submission_requirements[0].from,
            )
          ) {
            let predicateArray = []
            let descriptor = {}

            descriptor = inputDescriptors[i]

            console.log('')
            console.log('array of inputDescriptors')
            console.log(inputDescriptors)

            // (Eldersonar) This flag allows to track which input descriptors needs to be removed from the list
            let remove = false

            // Loop through all descriptor fields
            for (
              let j = 0;
              j < inputDescriptors[i].constraints.fields.length;
              j++
            ) {
              // (Eldersonar) If an input descriptor has some in-field conditional logic
              if (inputDescriptors[i].constraints.fields[j].filter.oneOf) {
                // (Eldersonar) Get fields with in-field conditional logic
                predicateArray.push(
                  inputDescriptors[i].constraints.fields[j].filter.oneOf,
                )

                // (Eldersonar) Mark this input descriptor for deletion
                remove = true
              }
            }

            // (Eldersonar) Get cartesian sets here
            if (predicateArray.length) {
              console.log('')
              console.log('this is ready to become cartesian set: ')
              console.log(predicateArray)

              // (Eldersonar) Assign the result of cartesian product of sets to a variable
              let cartesianProduct = cartesian(predicateArray, descriptor)

              await handleCartesianProductSet(
                descriptor,
                cartesianProduct,
                connectionID,
              )
              // (Eldersonar) Clear the predicate array before new iteration
              predicateArray = []
              descriptor = {}

              console.log('')
              console.log('cartesian product of an array set')
              console.log(cartesianProduct)
            }

            cartesianProduct = []

            if (i > -1 && remove) {
              inputDescriptors.splice(i, 1)
            }
          } else {
            console.log(
              'There are no credentials of group ' +
                pdf.presentation_definition.submission_requirements[0].from,
            )
          }
        }

        // (eldersonar) TODO: Wrap into an if statement to check if the the rest of the input descriptors are part of the submission requirment group.
        await handleSimpleDescriptors(inputDescriptors, connectionID)

        // (eldersonar) Handle nested submission requirments
      } else {
        console.log(
          '...........Handling creating proof requests from the nested submission requirements...........',
        )

        for (
          let g = 0;
          g <
          pdf.presentation_definition.submission_requirements[0].from_nested
            .length;
          g++
        ) {
          let chosenDescriptors = []

          for (let f = 0; f < inputDescriptors.length; f++) {
            if (
              inputDescriptors[f].group.includes(
                pdf.presentation_definition.submission_requirements[0]
                  .from_nested[g].from,
              )
            ) {
              chosenDescriptors.push(inputDescriptors[f])
            }
          }

          // Loop through the input descriptors
          let i = chosenDescriptors.length

          // (Eldersonar) Loop through all input descriptors
          while (i--) {
            // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
            if (
              chosenDescriptors[i].group.includes(
                pdf.presentation_definition.submission_requirements[0]
                  .from_nested[g].from,
              )
            ) {
              let predicateArray = []
              let descriptor = {}

              descriptor = chosenDescriptors[i]

              // (Eldersonar) This flag allows to track which input descriptors needs to be removed from the list
              let remove = false

              // Loop through all descriptor fields
              for (
                let j = 0;
                j < chosenDescriptors[i].constraints.fields.length;
                j++
              ) {
                // (Eldersonar) If an input descriptor has some in-field conditional logic
                if (chosenDescriptors[i].constraints.fields[j].filter.oneOf) {
                  // (Eldersonar) Get fields with in-field conditional logic
                  predicateArray.push(
                    chosenDescriptors[i].constraints.fields[j].filter.oneOf,
                  )

                  // (Eldersonar) Mark this input descriptor for deletion
                  remove = true
                }
              }

              // (Eldersonar) Get cartesian sets here
              if (predicateArray.length) {
                console.log('')
                console.log('this is ready to become cartesian set: ')
                console.log(predicateArray)

                // (Eldersonar) Assign the result of cartesian product of sets to a variable
                let cartesianProduct = cartesian(predicateArray, descriptor)

                handleCartesianProductSet(
                  descriptor,
                  cartesianProduct,
                  connectionID,
                )
                // (Eldersonar) Clear the predicate array before new iteration
                predicateArray = []
                descriptor = {}

                console.log('')
                console.log('cartesian product of an array set')
                console.log(cartesianProduct)
              }

              cartesianProduct = []

              if (i > -1 && remove) {
                chosenDescriptors.splice(i, 1)
              }
            } else {
              console.log(
                'There are no credentials of group ' +
                  pdf.presentation_definition.submission_requirements[0].from,
              )
            }
          }

          // (eldersonar) TODO: Wrap into an if statement to check if the the rest of the input descriptors are part of the submission requirment group.
          handleSimpleDescriptors(chosenDescriptors, connectionID)
        }
      }
    }
  } catch (error) {
    console.error('Error getting proof options')
    throw error
  }
}

const validateFieldByField = (attributes, inputDescriptor) => {
  // (eldersonar) Value validation happens here

  let result = null
  let typePass = false
  let formatPass = false
  let valuePass = false
  let patternPass = false

  for (let key in attributes) {
    if (attributes.hasOwnProperty(key)) {
      console.log('')
      console.log(key + ' -> ' + attributes[key].raw)

      // Create prefixed attribute key
      const prefix = '$.'
      let prefixedKey = ''
      prefixedKey += prefix
      prefixedKey += key

      for (let p = 0; p < inputDescriptor.constraints.fields.length; p++) {
        // (eldersonar) Validate if field can be found
        if (inputDescriptor.constraints.fields[p].path.includes(prefixedKey)) {
          // (eldersonar) Type validation
          if (inputDescriptor.constraints.fields[p].filter.type) {
            switch (inputDescriptor.constraints.fields[p].filter.type) {
              case 'string':
                // Support empty string && attributes[key].raw !== ""
                if (typeof attributes[key].raw === 'string') {
                  console.log('the type check (STRING) have passed')
                  typePass = true
                } else {
                  console.log('this is NOT A STRING or STRING IS EMPTY')
                  typePass = false
                  break
                }
                break

              case 'number':
                if (!isNaN(attributes[key].raw)) {
                  console.log('the type check (NUMBER) have passed')
                  typePass = true
                } else {
                  console.log('this is NOT A NUMBER')
                  typePass = false
                  break
                }
                break

              case 'boolean':
                if (
                  attributes[key].raw === 'true' ||
                  attributes[key].raw === 'false'
                ) {
                  console.log('the type check (BOOLEAN) have passed')
                  typePass = true
                } else {
                  console.log('this is NOT A BOOLEAN')
                  typePass = false
                  break
                }
                break

              default:
                console.log('Error: The type check failed')
                typePass = false
                break
            }
          } else {
            console.log('no type was found for this attribute')
            typePass = true
          }

          // (eldersonar) Format validation
          if (inputDescriptor.constraints.fields[p].filter.format) {
            let dateNumber = parseInt(attributes[key].raw, 10)

            // (eldersonar) Check if the value can be transformed to a valid number
            if (attributes[key].raw === '') {
              console.log('format passed')
              typePass = true
            } else if (!isNaN(dateNumber)) {
              console.log('the date check (NUMBER) have passed')
              let luxonDate = DateTime.fromMillis(dateNumber).toISO()
              let date = new DateTime(luxonDate).isValid

              // (eldersonar) Check if the valid Luxon datetime format
              if (date) {
                console.log('format passed')
                typePass = true
              } else {
                console.log('this is NOT A DATE')
                console.log('format failed')
                typePass = false
                break
              }
            } else {
              console.log('this is NOT A DATE')
              console.log('format failed')
              typePass = false
              break
            }
          } else {
            console.log('no format was found for this attribute')
            formatPass = true
          }

          // (eldersonar) Value validation
          if (inputDescriptor.constraints.fields[p].filter.const) {
            // (eldersonar) Check if the value is a number datatype
            if (!isNaN(inputDescriptor.constraints.fields[p].filter.const)) {
              const stringNumber =
                '' + inputDescriptor.constraints.fields[p].filter.const

              if (attributes[key].raw === stringNumber) {
                console.log('value passed')
                valuePass = true
              } else {
                console.log('value failed')
                valuePass = false
                break
              }
            } else {
              if (
                attributes[key].raw ===
                inputDescriptor.constraints.fields[p].filter.const
              ) {
                console.log('value passed')
                valuePass = true
              } else {
                console.log('value failed')
                valuePass = false
                break
              }
            }
          } else {
            console.log('no value was found for this attribute')
            valuePass = true
          }

          // (eldersonar) Pattern validation
          if (inputDescriptor.constraints.fields[p].filter.pattern) {
            // Check if it's base64 encoded
            if (attributes[key].raw === '') {
              console.log('pattern passed')
              patternPass = true
            } else if (
              Buffer.from(
                inputDescriptor.constraints.fields[p].filter.pattern,
                'base64',
              ).toString('base64') ===
              inputDescriptor.constraints.fields[p].filter.pattern
            ) {
              console.log('decoding....')

              const decodedPattern = Util.decodeBase64(
                inputDescriptor.constraints.fields[p].filter.pattern,
              )

              const re = new RegExp(decodedPattern)

              // (eldersonar) Test pattern
              if (re.test(attributes[key].raw)) {
                console.log('pattern passed')
                patternPass = true
              } else {
                console.log('pattern failed')
                patternPass = false
                break
              }
              // If not base64 encoded
            } else {
              const re = new RegExp(
                inputDescriptor.constraints.fields[p].filter.pattern,
              )

              // (eldersonar) Test pattern
              if (re.test(attributes[key].raw)) {
                console.log('pattern passed')
                patternPass = true
              } else {
                console.log('pattern failed')
                patternPass = false
                break
              }
            }
          } else {
            console.log('no pattern was found for this attribute')
            patternPass = true
          }
        }
      }
    }
    // Break out of outer loop if validation failed
    if (!typePass || !valuePass || !patternPass || !formatPass) {
      result = false
      break
    } else {
      result = true
    }
  }
  return result
}

// Governance message handler
const adminMessage = async (message) => {
  console.log('Received Presentations Message', message)

  const governance = await Governance.getGovernance()
  const privileges = await Governance.getPrivilegesByRoles()

  let endorserDID = null
  let schemaID = null
  const protocol = 'https://didcomm.org/issue-credential/1.0/'

  // Get cred def id and schema id
  if (message.presentation && message.presentation.identifiers.length) {
    endorserDID = message.presentation.identifiers[0].cred_def_id
      .split(':', 1)
      .toString()
    schemaID = message.presentation.identifiers[0].schema_id
  }

  // TODO: Check governance and don't send schema id
  const participantValidated = await Governance.validateParticipant(
    schemaID,
    protocol,
    endorserDID,
  )

  const pdf = await Governance.getPresentationDefinition()

  const inputDescriptors = pdf.presentation_definition.input_descriptors

  if (message.state === 'verified') {
    if (
      message.verified === 'true' &&
      participantValidated &&
      ((message.presentation.requested_proof.revealed_attrs &&
        Object.keys(message.presentation.requested_proof.revealed_attrs)
          .length > 0) ||
        (message.presentation.requested_proof.revealed_attr_groups &&
          Object.keys(message.presentation.requested_proof.revealed_attr_groups)
            .length > 0))
    ) {
      let attributes = ''
      let predicates = message.presentation.requested_proof.predicates

      // (mikekebert) Check the data format to see if the presentation requires the referrant pattern
      if (message.presentation.requested_proof.revealed_attr_groups) {
        attributes =
          message.presentation.requested_proof.revealed_attr_groups[
            Object.keys(
              message.presentation.requested_proof.revealed_attr_groups,
            )[0] // Get first group available
          ].values // TODO: this needs to be a for-in loop or similar later
      } else {
        attributes = message.presentation.requested_proof.revealed_attrs
      }

      const issuerName = await getOrganization()

      let credentialVerifiedAttributes = null

      if (attributes) {
        let credentialAttributes = [
          {
            name: 'traveler_surnames',
            value: attributes.patient_surnames.raw || '',
          },
          {
            name: 'traveler_given_names',
            value: attributes.patient_given_names.raw || '',
          },
          {
            name: 'traveler_date_of_birth',
            value: attributes.patient_date_of_birth.raw || '',
          },
          {
            name: 'traveler_gender_legal',
            value: attributes.patient_gender_legal.raw || '',
          },
          {
            name: 'traveler_country',
            value: attributes.patient_country.raw || '',
          },
          {
            name: 'traveler_origin_country',
            value: '',
          },
          {
            name: 'traveler_email',
            value: attributes.patient_email.raw || '',
          },
          {
            name: 'trusted_traveler_id',
            value: uuid(),
          },
          {
            name: 'trusted_traveler_issue_date_time',
            value: Math.round(
              DateTime.fromISO(new Date()).ts / 1000,
            ).toString(),
          },
          {
            name: 'trusted_traveler_expiration_date_time',
            value: Math.round(
              DateTime.local().plus({days: 30}).ts / 1000,
            ).toString(),
          },
          {
            name: 'governance_applied',
            value: governance.name + ' v' + governance.version,
          },
          {
            name: 'credential_issuer_name',
            value: issuerName.dataValues.value.organizationName || '',
          },
          {
            name: 'credential_issue_date',
            value: Math.round(
              DateTime.fromISO(new Date()).ts / 1000,
            ).toString(),
          },
        ]

        // Non-nested validation happens here
        // (eldersonar) Check if we have submission requirments
        if (pdf.presentation_definition.submission_requirements) {
          // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
          if (
            !pdf.presentation_definition.submission_requirements[0].hasOwnProperty(
              'from_nested',
            )
          ) {
            for (let i = 0; i < inputDescriptors.length; i++) {
              console.log('')
              console.log(
                `Comparing proof with ${inputDescriptors[i].name} input descriptor`,
              )
              console.log('')

              let fields = []
              let proofResult = false

              let fieldsValidationResult = false

              // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
              if (
                inputDescriptors[i].group.includes(
                  pdf.presentation_definition.submission_requirements[0].from,
                )
              ) {
                // Get an array of attributes
                for (
                  let j = 0;
                  j < inputDescriptors[i].constraints.fields.length;
                  j++
                ) {
                  const fieldPath = inputDescriptors[i].constraints.fields[
                    j
                  ].path
                    .join('')
                    .split('$.')[1] // (eldersonar) TODO: turn into a loop. This will be not valid if have more than 1 path in the array

                  fields.push(fieldPath)
                }
              }

              // (eldersonar) Get and sort the list of proof attributes and descriptor fields
              const proofAttributeKeys = Object.keys(attributes)
              const proofPredicateKeys = Object.keys(predicates)
              const predicatesAndArrays = proofAttributeKeys.concat(
                proofPredicateKeys,
              )
              const sortedProofFields = predicatesAndArrays.sort(function (
                a,
                b,
              ) {
                return a.localeCompare(b)
              })
              const sortedDescriptorFields = fields.sort(function (a, b) {
                return a.localeCompare(b)
              })

              // (eldersonar) Start validation
              if (sortedProofFields.length && sortedDescriptorFields.length) {
                // (eldersonar) Check if there is no array match (no credential match or no predicate match)
                if (
                  JSON.stringify(sortedProofFields) !=
                  JSON.stringify(sortedDescriptorFields)
                ) {
                  // (eldersonar) Get leftover fields with the filter
                  let nonDuplicateFields = sortedProofFields.filter(
                    (val) => !sortedDescriptorFields.includes(val),
                  )

                  for (
                    let k = 0;
                    k < inputDescriptors[i].constraints.fields.length;
                    k++
                  ) {
                    // (eldersonar) Check if input descriptor has in-field conditional logic
                    if (
                      inputDescriptors[i].constraints.fields[k].filter.oneOf
                    ) {
                      for (
                        let l = 0;
                        l <
                        inputDescriptors[i].constraints.fields[k].filter.oneOf
                          .length;
                        l++
                      ) {
                        for (let m = 0; m < nonDuplicateFields.length; m++) {
                          const prefix = '$.'
                          let lookupField = ''
                          lookupField += prefix
                          lookupField += nonDuplicateFields[m]

                          // (eldersonar) If we can find the field name in the list of in-field predicates
                          if (
                            inputDescriptors[i].constraints.fields[
                              k
                            ].filter.oneOf[l].dependent_fields[0].path.includes(
                              lookupField,
                            )
                          ) {
                            // (eldersonar) Removing predicate from the list of sorted fields
                            const index = sortedProofFields.indexOf(
                              nonDuplicateFields[m],
                            )
                            if (index > -1) {
                              sortedProofFields.splice(index, 1)
                            }

                            console.log(sortedProofFields)
                            console.log(sortedDescriptorFields)
                            console.log(
                              JSON.stringify(sortedProofFields) ===
                                JSON.stringify(sortedDescriptorFields),
                            )

                            // (eldersonar) Check if arrays match after the predicates were removed
                            if (
                              JSON.stringify(sortedProofFields) ===
                              JSON.stringify(sortedDescriptorFields)
                            ) {
                              console.log('')
                              console.log(
                                '_____________________________________________',
                              )
                              console.log('Validation of proof was successful.')

                              fieldsValidationResult = validateFieldByField(
                                attributes,
                                inputDescriptors[i],
                              )

                              proofResult = true
                            } else {
                              // console.log("Validation failed.")
                              proofResult = false
                            }
                          } else {
                            // console.log("Validation failed. No match was found.")
                            proofResult = false
                          }
                        }
                      }
                    }
                  }
                }
                // (eldersonar) Perfect match, proof fields are validated!
                else {
                  console.log('')
                  console.log('_____________________________________________')
                  console.log('Validation of proof was successful.')

                  fieldsValidationResult = validateFieldByField(
                    attributes,
                    inputDescriptors[i],
                  )

                  proofResult = true
                }
              } else {
                console.log('Error: lacking data for validation')
              }

              console.log(proofResult)
              console.log(fieldsValidationResult)

              // (eldersonar) Hanlding additional manual validation for non-nested submission requirements
              // Check if all level validation passed
              if (proofResult && fieldsValidationResult) {
                console.log(
                  'Hanlding additional manual validation for non-nested submission requirements ',
                )

                if (
                  attributes.lab_result &&
                  attributes.lab_specimen_collected_date
                ) {
                  console.log(attributes.lab_specimen_collected_date.raw * 1000)
                  console.log(DateTime.local().plus({days: -3}).ts)
                  if (
                    attributes.lab_result.raw === 'Negative' &&
                    attributes.lab_specimen_collected_date.raw * 1000 >
                      DateTime.local().plus({days: -3}).ts
                  ) {
                    credentialVerifiedAttributes = credentialAttributes
                  }
                } else {
                  console.log("Haven't meet any of the reqs")
                }

                console.log('Issuing trusted traveler credential.')

                // credentialVerifiedAttributes = credentialAttributes
                let schema_id = ''

                // (eldersonar) Validate the privileges
                if (
                  governance &&
                  privileges.includes('issue_trusted_traveler')
                ) {
                  for (let i = 0; i < governance.actions.length; i++) {
                    // (eldersonar) Get schema id for trusted traveler
                    if (
                      governance.actions[i].name === 'issue_trusted_traveler'
                    ) {
                      schema_id = governance.actions[i].details.schema
                    }
                  }

                  // (eldersonar) Get schema information
                  if (credentialVerifiedAttributes !== null) {
                    let newCredential = {
                      connectionID: message.connection_id,
                      schemaID: schema_id,
                      schemaVersion: schema_id.split(':')[3],
                      schemaName: schema_id.split(':')[2],
                      schemaIssuerDID: schema_id.split(':')[0],
                      comment: '',
                      attributes: credentialVerifiedAttributes,
                    }

                    // (mikekebert) Request issuance of the trusted_traveler credential
                    console.log('ready to issue trusted traveler')

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

                    credentialVerifiedAttributes = null
                  } else {
                    // (mikekebert) Send a basic message saying the verification was rejected because of business logic
                    await AdminAPI.Connections.sendBasicMessage(
                      message.connection_id,
                      {
                        content: 'INVALID_PROOF',
                      },
                    )
                  }
                } else {
                  console.log('no governance or insificient privilieges')
                  await AdminAPI.Connections.sendBasicMessage(
                    message.connection_id,
                    {
                      content: 'INVALID_PRIVILEGES',
                    },
                  )
                }
              } else {
                console.log('')
                console.log('One or all the field comparison attempts failed.')
                console.log(
                  "The field comparison attempts failed while looping through input descriptor list. It can be just wrong descriptor or the list of attributes from the correct proof and fields from input descriptor didn't match.",
                )
                console.log('')
              }
            }
          }
        }
      }
    } else if (
      message.verified === 'true' &&
      !participantValidated &&
      message.presentation.requested_proof.self_attested_attrs &&
      Object.keys(message.presentation.requested_proof.self_attested_attrs)
        .length === 0
    ) {
      // (eldersonar) Send a basic message
      console.log("I'm here")
      console.log(message.state)
      console.log(message.verified)
      await AdminAPI.Connections.sendBasicMessage(message.connection_id, {
        content:
          "We're sorry, but we don't currently recognize the issuer of your credential and cannot approve it at this time.",
      })
      // (eldersonar) Handle passport and demographic
    } else {
      console.log('self-attested')
      console.log(message.presentation.requested_proof)

      // (eldersonar) Get contact id
      let contact = await Contacts.getContactByConnection(
        message.connection_id,
        [],
      )
      console.log('----this is the contact_id ----')
      console.log('contact id is: ' + contact.contact_id)

      // (edersonar) Create demographic
      await Demographics.updateOrCreateDemographic(
        contact.contact_id,
        message.presentation.requested_proof.self_attested_attrs.email,
        message.presentation.requested_proof.self_attested_attrs.phone,
        message.presentation.requested_proof.self_attested_attrs.street_address,
        message.presentation.requested_proof.self_attested_attrs.city,
        message.presentation.requested_proof.self_attested_attrs
          .state_province_region,
        message.presentation.requested_proof.self_attested_attrs.postalcode,
        message.presentation.requested_proof.self_attested_attrs.country,
      )

      // (eldersonar) Create passport
      await Passports.updateOrCreatePassport(
        contact.contact_id,
        message.presentation.requested_proof.self_attested_attrs
          .passport_number,
        message.presentation.requested_proof.self_attested_attrs.surname,
        message.presentation.requested_proof.self_attested_attrs.given_names,
        message.presentation.requested_proof.self_attested_attrs.sex,
        message.presentation.requested_proof.self_attested_attrs.date_of_birth,
        message.presentation.requested_proof.self_attested_attrs.place_of_birth,
        message.presentation.requested_proof.self_attested_attrs.nationality,
        message.presentation.requested_proof.self_attested_attrs.date_of_issue,
        message.presentation.requested_proof.self_attested_attrs
          .date_of_expiration,
        message.presentation.requested_proof.self_attested_attrs.type,
        message.presentation.requested_proof.self_attested_attrs
          .issuing_country,
        message.presentation.requested_proof.self_attested_attrs.authority,
        message.presentation.requested_proof.self_attested_attrs.photo,
      )
    }
  } else if (message.state === null) {
    // (mikekebert) Send a basic message saying the verification failed for technical reasons
    console.log('Validation failed for technical reasons')
    await AdminAPI.Connections.sendBasicMessage(message.connection_id, {
      content: 'UNVERIFIED',
    })
  } else {
  }
}

const createPresentationReports = async (presentation) => {
  try {
    const presentationReport = await Presentations.createPresentationReports(
      presentation.presentation_exchange_id,
      presentation.trace,
      presentation.connection_id,
      presentation.role,
      presentation.created_at,
      presentation.updated_at,
      JSON.stringify(presentation.presentation_request_dict),
      presentation.initiator,
      JSON.stringify(presentation.presentation_request),
      presentation.state,
      presentation.thread_id,
      presentation.auto_present,
      JSON.stringify(presentation.presentation),
    )

    // Broadcast the message to all connections
    Websockets.sendMessageToAll('PRESENTATIONS', 'PRESENTATION_REPORTS', {
      presentation_reports: [presentationReport],
    })
  } catch (error) {
    console.log('Error creating presentation reports:')
    throw error
  }
}

const updatePresentationReports = async (presentation) => {
  try {
    const presentationReport = await Presentations.updatePresentationReports(
      presentation.presentation_exchange_id,
      presentation.trace,
      presentation.connection_id,
      presentation.role,
      presentation.created_at,
      presentation.updated_at,
      JSON.stringify(presentation.presentation_request_dict),
      presentation.initiator,
      JSON.stringify(presentation.presentation_request),
      presentation.state,
      presentation.thread_id,
      presentation.auto_present,
      JSON.stringify(presentation.presentation),
    )

    // Broadcast the message to all connections
    Websockets.sendMessageToAll('PRESENTATIONS', 'PRESENTATION_REPORTS', {
      presentation_reports: [presentationReport],
    })
  } catch (error) {
    console.log('Error updating presentation reports:')
    throw error
  }
}

const getAll = async () => {
  try {
    console.log('Fetching presentation reports!')
    const presentationReports = await Presentations.readPresentations()

    return presentationReports
  } catch (error) {
    console.log('Error fetching presentation reports:')
    throw error
  }
}

module.exports = {
  adminMessage,
  requestPresentation,
  requestIdentityPresentation,
  createPresentationReports,
  updatePresentationReports,
  getAll,
}
